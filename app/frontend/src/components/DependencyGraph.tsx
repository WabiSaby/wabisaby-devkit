import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { projects } from '../lib/wails';
import { X, ZoomIn, ZoomOut, Move, GitGraph, AlertTriangle } from 'lucide-react';

// Node dimensions – fit Go module path display (last segment) + version
const ROOT_MIN_WIDTH = 180;
const ROOT_HEIGHT = 52;
const DEP_MIN_WIDTH = 200;
const DEP_HEIGHT = 56;
const HORIZONTAL_GAP = 24;
const VERTICAL_GAP = 48;
const MIN_SIDE_PADDING = 64;

/** Last path segment of a Go module path, or the string as-is if no slash */
function moduleDisplayName(path) {
    if (!path || typeof path !== 'string') return path || '';
    const idx = path.lastIndexOf('/');
    return idx >= 0 ? path.slice(idx + 1) : path;
}

export function DependencyGraph({ projectName, onClose }) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState([]);
    const [error, setError] = useState(null);
    const [scale, setScale] = useState(1);
    const [translate, setTranslate] = useState({ x: 0, y: 0 });
    const containerRef = useRef(null);

    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            const { success, data, message } = await projects.dependencies(projectName);
            if (cancelled) return;
            if (success) setData(data || []);
            else setError(message);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [projectName, retryCount]);

    const fetchDeps = useCallback(() => setRetryCount((c) => c + 1), []);

    const [isClosing, setIsClosing] = useState(false);
    const dialogRef = useRef(null);

    const handleClose = useCallback(() => {
        if (isClosing) return;
        setIsClosing(true);
    }, [isClosing]);

    const handleAnimationEnd = useCallback(
        (e) => {
            if (e.target !== dialogRef.current || e.animationName !== 'scale-down') return;
            onClose();
        },
        [onClose]
    );

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') handleClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleClose]);

    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

    const { nodes, edges } = useMemo(() => {
        const count = data.length;
        const root = {
            id: 'root',
            name: projectName,
            displayLabel: projectName,
            type: 'root',
            x: 0,
            y: 0,
            width: ROOT_MIN_WIDTH,
            height: ROOT_HEIGHT,
        };

        const depNodes = data.map((dep, i) => {
            const name = dep.Name || dep.name;
            return {
                ...dep,
                id: `dep-${i}`,
                name,
                displayLabel: moduleDisplayName(name),
                version: dep.Version || dep.version,
                type: 'dep',
                width: DEP_MIN_WIDTH,
                height: DEP_HEIGHT,
                x: 0,
                y: 0,
            };
        });

        // Grid layout: root on top center, deps in rows below based on available width
        const availableWidth = Math.max(DEP_MIN_WIDTH, dimensions.width - MIN_SIDE_PADDING);
        const columns = Math.max(1, Math.min(6, Math.floor((availableWidth + HORIZONTAL_GAP) / (DEP_MIN_WIDTH + HORIZONTAL_GAP))));
        depNodes.forEach((node, i) => {
            const col = i % columns;
            const row = Math.floor(i / columns);
            const rowCount = Math.min(columns, count - row * columns);
            const rowWidth = rowCount * (DEP_MIN_WIDTH + HORIZONTAL_GAP) - HORIZONTAL_GAP;
            const startX = -rowWidth / 2 + DEP_MIN_WIDTH / 2;
            node.x = startX + col * (DEP_MIN_WIDTH + HORIZONTAL_GAP);
            node.y = ROOT_HEIGHT + VERTICAL_GAP + row * (DEP_HEIGHT + VERTICAL_GAP);
        });

        const edges = depNodes.map((node) => ({
            id: `edge-${node.id}`,
            from: { x: 0, y: ROOT_HEIGHT },
            to: { x: node.x, y: node.y },
        }));

        const allNodes = [root, ...depNodes];
        return {
            nodes: allNodes,
            edges,
        };
    }, [projectName, data, dimensions.width]);

    const dragging = useRef(false);
    const [isDragging, setIsDragging] = useState(false);
    const lastPos = useRef({ x: 0, y: 0 });

    const handleWheel = (e) => {
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        setScale((s) => Math.min(Math.max(0.2, s + delta), 3));
    };

    const handleMouseDown = (e) => {
        dragging.current = true;
        setIsDragging(true);
        lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e) => {
        if (!dragging.current) return;
        const dx = e.clientX - lastPos.current.x;
        const dy = e.clientY - lastPos.current.y;
        setTranslate((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
        dragging.current = false;
        setIsDragging(false);
    };

    useEffect(() => {
        if (containerRef.current) {
            setDimensions({
                width: containerRef.current.clientWidth,
                height: containerRef.current.clientHeight,
            });
        }
    }, [loading]);

    const centerX = dimensions.width / 2 + translate.x;
    const centerY = Math.min(120, dimensions.height / 4) + translate.y;

    return (
        <div
            className={`modal${isClosing ? ' modal--closing' : ''}`}
            onClick={handleClose}
        >
            <div className="modal__backdrop" />
            <div
                ref={dialogRef}
                className="modal__dialog modal--fullscreen dependency-graph-modal"
                onClick={(e) => e.stopPropagation()}
                onAnimationEnd={handleAnimationEnd}
                style={{ display: 'flex', flexDirection: 'column' }}
            >
                <div className="modal__header">
                    <div className="dependency-graph__header-inner">
                        <GitGraph size={20} className="dependency-graph__header-icon" />
                        <div>
                            <h3 className="modal__title">{projectName}</h3>
                            <p className="dependency-graph__header-subtitle">Wabi Saby dependencies</p>
                        </div>
                        {!loading && !error && data.length > 0 && (
                            <span className="badge badge--muted">{data.length} deps</span>
                        )}
                    </div>
                    <button type="button" className="modal__close" onClick={handleClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>
                <div
                    className={`dependency-graph__canvas modal__body${isDragging ? ' dependency-graph__canvas--dragging' : ''}`}
                    ref={containerRef}
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    style={{
                        flex: 1,
                        overflow: 'hidden',
                        position: 'relative',
                        padding: 0,
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    {loading && (
                        <div className="dependency-graph__state dependency-graph__state--loading">
                            <div className="loading-spinner" />
                        </div>
                    )}

                    {error && (
                        <div className="dependency-graph__state dependency-graph__error">
                            <AlertTriangle size={40} className="dependency-graph__error-icon" />
                            <p>Failed to load dependencies: {error}</p>
                            <button type="button" className="btn btn--secondary" onClick={fetchDeps}>
                                Retry
                            </button>
                        </div>
                    )}

                    {!loading && !error && data.length === 0 && (
                        <div className="dependency-graph__state dependency-graph__empty">
                            <GitGraph size={48} strokeWidth={1.5} className="dependency-graph__empty-icon" />
                            <p>No Wabi Saby project dependencies</p>
                            <p className="dependency-graph__empty-sub">This project does not depend on other repos in this devkit.</p>
                        </div>
                    )}

                    {!loading && !error && data.length > 0 && (
                        <svg
                            className="dependency-graph__svg"
                            width="100%"
                            height="100%"
                            style={{ flex: 1 }}
                            viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
                            preserveAspectRatio="xMidYMid meet"
                        >
                            <defs>
                                <linearGradient id="dep-graph-root-fill" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.85" />
                                    <stop offset="100%" stopColor="var(--color-primary-hover)" stopOpacity="0.9" />
                                </linearGradient>
                                <filter id="dep-graph-shadow" x="-20%" y="-20%" width="140%" height="140%">
                                    <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,0.3)" floodOpacity="0.4" />
                                </filter>
                                <filter id="dep-graph-shadow-sm" x="-20%" y="-20%" width="140%" height="140%">
                                    <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="rgba(0,0,0,0.25)" floodOpacity="0.35" />
                                </filter>
                            </defs>
                            <g
                                transform={`translate(${centerX}, ${centerY}) scale(${scale})`}
                                style={{ transformOrigin: 'center center' }}
                            >
                                {/* Edges: soft line from root bottom to each dep top */}
                                {edges.map((edge) => (
                                    <line
                                        key={edge.id}
                                        x1={edge.from.x}
                                        y1={edge.from.y}
                                        x2={edge.to.x}
                                        y2={edge.to.y}
                                        className="dependency-graph__edge"
                                    />
                                ))}

                                {/* Dependency nodes – rect for shape + foreignObject for text (fit + truncate) */}
                                {nodes.filter((n) => n.type === 'dep').map((node, i) => (
                                    <g
                                        key={node.id}
                                        className="dependency-graph__node-group"
                                        style={{ animationDelay: `${40 + i * 40}ms` }}
                                        transform={`translate(${node.x - node.width / 2}, ${node.y})`}
                                    >
                                        <rect
                                            width={node.width}
                                            height={node.height}
                                            rx="12"
                                            ry="12"
                                            className="dependency-graph__node dependency-graph__node--dep"
                                            filter="url(#dep-graph-shadow-sm)"
                                        />
                                        <foreignObject x={0} y={0} width={node.width} height={node.height} className="dependency-graph__node-fo">
                                            <div className="dependency-graph__node-content" {...({ xmlns: 'http://www.w3.org/1999/xhtml', title: node.name } as React.HTMLAttributes<HTMLDivElement>)}>
                                                <span className="dependency-graph__node-label">{node.displayLabel}</span>
                                                {node.version && (
                                                    <span className="dependency-graph__node-version">{node.version}</span>
                                                )}
                                            </div>
                                        </foreignObject>
                                    </g>
                                ))}

                                {/* Root node */}
                                {nodes.filter((n) => n.type === 'root').map((node) => (
                                    <g
                                        key={node.id}
                                        className="dependency-graph__node-group"
                                        style={{ animationDelay: '0ms' }}
                                        transform={`translate(${-node.width / 2}, ${node.y})`}
                                    >
                                        <rect
                                            width={node.width}
                                            height={node.height}
                                            rx="14"
                                            ry="14"
                                            className="dependency-graph__node dependency-graph__node--root"
                                            filter="url(#dep-graph-shadow)"
                                        />
                                        <foreignObject x={0} y={0} width={node.width} height={node.height} className="dependency-graph__node-fo">
                                            <div className="dependency-graph__node-content dependency-graph__node-content--root" {...({ xmlns: 'http://www.w3.org/1999/xhtml', title: node.name } as React.HTMLAttributes<HTMLDivElement>)}>
                                                <span className="dependency-graph__node-label dependency-graph__node-label--root">{node.displayLabel}</span>
                                            </div>
                                        </foreignObject>
                                    </g>
                                ))}
                            </g>
                        </svg>
                    )}

                    <div className="graph-controls dependency-graph__controls">
                        <button className="btn btn--secondary btn--icon btn--sm" onClick={() => setScale((s) => s * 1.2)} title="Zoom In">
                            <ZoomIn size={16} />
                        </button>
                        <button className="btn btn--secondary btn--icon btn--sm" onClick={() => setScale((s) => s / 1.2)} title="Zoom Out">
                            <ZoomOut size={16} />
                        </button>
                        <button
                            className="btn btn--secondary btn--icon btn--sm"
                            onClick={() => {
                                setTranslate({ x: 0, y: 0 });
                                setScale(1);
                            }}
                            title="Reset View"
                        >
                            <Move size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
