import React, { useEffect, useState, useCallback } from 'react';
import { projects as projectsAPI, events, submodule } from '../lib/wails';
import { ProjectCard } from '../components/ProjectCard';
import { StreamModal } from '../components/StreamModal';
import { TagsModal } from '../components/TagsModal';
import { Skeleton } from '../components/Skeleton';
import { RefreshCw, GitMerge, X } from 'lucide-react';

export function ProjectsView() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [streamModal, setStreamModal] = useState(null);
    const [streamLines, setStreamLines] = useState([]);
    const [streamActive, setStreamActive] = useState(false);
    const [tagsProject, setTagsProject] = useState(null);
    const [submoduleNeedsSync, setSubmoduleNeedsSync] = useState(null);
    const [submoduleSyncing, setSubmoduleSyncing] = useState(false);
    const [submoduleBannerDismissed, setSubmoduleBannerDismissed] = useState(false);

    const fetchProjects = useCallback(async () => {
        setLoading(true);
        if (!window.runtime && !window.go) {
            setTimeout(() => {
                setData([
                    { name: 'wabisaby-core', branch: 'main', status: 'clean', language: 'Go' },
                    { name: 'wabisaby-web', branch: 'main', status: 'dirty', language: 'TypeScript' },
                ]);
                setLoading(false);
            }, 500);
            return;
        }
        const { success, data: list } = await projectsAPI.list();
        if (success) setData(Array.isArray(list) ? list : []);
        setLoading(false);
    }, []);

    const fetchSubmoduleStatus = useCallback(async () => {
        if (!window.go) return;
        const status = await submodule.getSyncStatus();
        const needs = status?.needsSync;
        setSubmoduleNeedsSync(Array.isArray(needs) && needs.length > 0 ? needs : null);
    }, []);

    useEffect(() => {
        const t = setTimeout(() => {
            fetchProjects();
            fetchSubmoduleStatus();
        }, 0);
        return () => clearTimeout(t);
    }, [fetchProjects, fetchSubmoduleStatus]);

    useEffect(() => {
        if (!streamModal) return;
        const onLine = (payload) => {
            if (payload?.line != null) setStreamLines((prev) => [...prev, payload.line]);
        };
        const onDone = () => setStreamActive(false);
        events.on('devkit:project:stream', onLine);
        events.on('devkit:project:stream:done', onDone);
        return () => {
            events.off('devkit:project:stream');
            events.off('devkit:project:stream:done');
        };
    }, [streamModal]);

    const handleAction = async (action, project) => {
        if (!project?.name) return;
        const name = project.name;

        if (action === 'open') {
            const { success, message } = await projectsAPI.open(name);
            if (!success) console.error(message);
            return;
        }

        if (action === 'tags') {
            setTagsProject(name);
            return;
        }

        if (action === 'build' || action === 'test' || action === 'logs') {
            setStreamModal({ project: name, action });
            setStreamLines([]);
            setStreamActive(true);
            const { success, message } = await projectsAPI.startStream(name, action);
            if (!success) {
                setStreamLines((prev) => [...prev, message || 'Failed to start stream']);
                setStreamActive(false);
            }
            return;
        }
    };

    const closeStreamModal = () => {
        if (streamModal && streamActive) {
            projectsAPI.stopStream(streamModal.project, streamModal.action);
        }
        setStreamModal(null);
        setStreamLines([]);
        setStreamActive(false);
    };

    const handleSubmoduleSync = async () => {
        setSubmoduleSyncing(true);
        const { success } = await submodule.sync('Sync submodules');
        setSubmoduleSyncing(false);
        if (success) {
            setSubmoduleNeedsSync(null);
            setSubmoduleBannerDismissed(true);
            fetchSubmoduleStatus();
            fetchProjects();
        }
    };

    const showSubmoduleBanner =
        submoduleNeedsSync &&
        submoduleNeedsSync.length > 0 &&
        !submoduleBannerDismissed &&
        (window.go != null);

    return (
        <div className="view">
            {showSubmoduleBanner && (
                <div className="banner banner--warning">
                    <div className="banner__content">
                        <GitMerge size={18} style={{ color: 'var(--color-warning)' }} />
                        <span>Submodules need sync: {submoduleNeedsSync.join(', ')}</span>
                    </div>
                    <div className="banner__actions">
                        <button
                            type="button"
                            onClick={handleSubmoduleSync}
                            disabled={submoduleSyncing}
                            className="btn btn--primary"
                        >
                            {submoduleSyncing ? 'Syncing...' : 'Sync submodules'}
                        </button>
                        <button type="button" onClick={() => setSubmoduleBannerDismissed(true)} className="btn btn--ghost">
                            <X size={18} />
                        </button>
                    </div>
                </div>
            )}

            <div className="view__header">
                <div className="view__title-group">
                    <h2 className="view__title">Active Projects</h2>
                    <p className="view__subtitle">Manage and monitor your development workspaces.</p>
                </div>
                <div className="view__actions">
                    <button type="button" onClick={fetchProjects} className="btn btn--secondary">
                        <RefreshCw size={14} className={loading ? 'icon-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {loading && data.length === 0 ? (
                <div className="view__body">
                    <div className="view__grid">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="card project-card" style={{ pointerEvents: 'none' }}>
                                <div className="card__main">
                                    <div className="card__header">
                                        <Skeleton width={40} height={40} variant="circle" />
                                        <Skeleton width={60} height={20} />
                                    </div>
                                    <Skeleton width="70%" height={24} style={{ marginBottom: 8 }} />
                                    <Skeleton width="40%" height={16} />
                                </div>
                                <div className="card__footer">
                                    <div className="card__actions">
                                        <Skeleton width={80} height={24} />
                                        <Skeleton width={80} height={24} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="view__body">
                    <div className="view__grid">
                        {data.map((p) => (
                            <ProjectCard key={p.name} project={p} onAction={handleAction} />
                        ))}
                    </div>
                </div>
            )}

            {streamModal && (
                <StreamModal
                    title={`${streamModal.project} — ${streamModal.action}`}
                    lines={streamLines}
                    onClose={closeStreamModal}
                    isActive={streamActive}
                />
            )}

            {tagsProject && (
                <TagsModal projectName={tagsProject} onClose={() => setTagsProject(null)} />
            )}
        </div>
    );
}
