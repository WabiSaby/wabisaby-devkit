import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Fuse from 'fuse.js';
import { Search, ChevronRight, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react';
import { ALL_COMMANDS, getCategories } from '../lib/commands';

const FUSE_OPTIONS = {
  keys: [
    { name: 'label', weight: 0.5 },
    { name: 'category', weight: 0.2 },
    { name: 'keywords', weight: 0.3 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true,
};

export function CommandPalette({ open, onClose, ctx }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [closing, setClosing] = useState(false);
  // Two-step: when a parameterized command is selected
  const [paramMode, setParamMode] = useState(null); // { command, params: [] }
  const [paramQuery, setParamQuery] = useState('');
  const [paramIndex, setParamIndex] = useState(0);
  const [loadingParams, setLoadingParams] = useState(false);

  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Fuse instance for commands
  const fuse = useMemo(() => new Fuse(ALL_COMMANDS, FUSE_OPTIONS), []);

  // Fuse instance for params (when in param mode)
  const paramFuse = useMemo(() => {
    if (!paramMode?.params?.length) return null;
    return new Fuse(paramMode.params, {
      keys: ['label', 'description'],
      threshold: 0.4,
      ignoreLocation: true,
      includeScore: true,
    });
  }, [paramMode]);

  // ── Filtered results ────────────────────────────────────────────────────

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return ALL_COMMANDS;
    return fuse.search(query).map((r) => r.item);
  }, [query, fuse]);

  const filteredParams = useMemo(() => {
    if (!paramMode?.params) return [];
    if (!paramQuery.trim()) return paramMode.params;
    if (!paramFuse) return paramMode.params;
    return paramFuse.search(paramQuery).map((r) => r.item);
  }, [paramQuery, paramMode, paramFuse]);

  // Group commands by category for display
  const groupedCommands = useMemo(() => {
    const categories = getCategories();
    const groups = [];
    let flatIndex = 0;
    for (const cat of categories) {
      const items = filteredCommands.filter((c) => c.category === cat);
      if (items.length === 0) continue;
      groups.push({
        category: cat,
        items: items.map((item) => ({ ...item, _flatIndex: flatIndex++ })),
      });
    }
    return { groups, total: flatIndex };
  }, [filteredCommands]);

  // ── Reset on open/close ─────────────────────────────────────────────────

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setClosing(false);
      setParamMode(null);
      setParamQuery('');
      setParamIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // ── Scroll active item into view ────────────────────────────────────────

  useEffect(() => {
    const el = listRef.current?.querySelector('.cmd-palette__item--active');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, paramIndex]);

  // ── Close with animation ────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 150);
  }, [onClose]);

  // ── Execute command ─────────────────────────────────────────────────────

  const executeCommand = useCallback(
    async (command) => {
      if (command.getParams && !paramMode) {
        // Enter param mode
        setLoadingParams(true);
        try {
          const params = await command.getParams(ctx);
          if (!params || params.length === 0) {
            // No params available, just close
            handleClose();
            return;
          }
          setParamMode({ command, params });
          setParamQuery('');
          setParamIndex(0);
          setTimeout(() => inputRef.current?.focus(), 50);
        } finally {
          setLoadingParams(false);
        }
        return;
      }

      // Determine the actual command definition and param id
      const cmdDef = paramMode ? paramMode.command : command;
      const paramId = paramMode ? command.id : null;

      handleClose();

      // Resolve feedback messages for this command
      const fb = cmdDef.feedback
        ? cmdDef.feedback(paramId)
        : null;

      if (fb?.pending && ctx.toast) {
        ctx.toast.info(fb.pending);
      }

      try {
        if (paramMode) {
          const result = await paramMode.command.action(ctx, command.id);
          // Check for { success: false } pattern from callForSuccess wrapper
          if (result && result.success === false) {
            const errMsg = fb?.error || result.message || 'Command failed';
            if (ctx.toast) ctx.toast.error(errMsg);
          } else if (fb?.success && ctx.toast) {
            ctx.toast.success(fb.success);
          }
        } else {
          const result = await command.action(ctx);
          if (result && result.success === false) {
            const errMsg = fb?.error || result.message || 'Command failed';
            if (ctx.toast) ctx.toast.error(errMsg);
          } else if (fb?.success && ctx.toast) {
            ctx.toast.success(fb.success);
          }
        }
      } catch (err) {
        console.error('Command palette action error:', err);
        const errMsg = fb?.error || err?.message || 'Command failed';
        if (ctx.toast) ctx.toast.error(errMsg);
      }
    },
    [ctx, handleClose, paramMode]
  );

  // ── Keyboard navigation ─────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e) => {
      if (paramMode) {
        const total = filteredParams.length;
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setParamIndex((i) => (i + 1) % Math.max(total, 1));
            break;
          case 'ArrowUp':
            e.preventDefault();
            setParamIndex((i) => (i - 1 + Math.max(total, 1)) % Math.max(total, 1));
            break;
          case 'Enter':
            e.preventDefault();
            if (filteredParams[paramIndex]) {
              executeCommand(filteredParams[paramIndex]);
            }
            break;
          case 'Escape':
            e.preventDefault();
            // Go back to command list
            setParamMode(null);
            setParamQuery('');
            setParamIndex(0);
            setQuery('');
            setActiveIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
            break;
          case 'Backspace':
            if (paramQuery === '') {
              e.preventDefault();
              setParamMode(null);
              setParamQuery('');
              setParamIndex(0);
              setTimeout(() => inputRef.current?.focus(), 50);
            }
            break;
        }
        return;
      }

      const total = groupedCommands.total;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % Math.max(total, 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((i) => (i - 1 + Math.max(total, 1)) % Math.max(total, 1));
          break;
        case 'Enter':
          e.preventDefault();
          {
            const flatItems = groupedCommands.groups.flatMap((g) => g.items);
            const selected = flatItems[activeIndex];
            if (selected) executeCommand(selected);
          }
          break;
        case 'Escape':
          e.preventDefault();
          handleClose();
          break;
      }
    },
    [groupedCommands, activeIndex, paramMode, filteredParams, paramIndex, executeCommand, handleClose, paramQuery]
  );

  // ── Don't render if not open ────────────────────────────────────────────

  if (!open && !closing) return null;

  const isParamMode = !!paramMode;
  const displayQuery = isParamMode ? paramQuery : query;
  const placeholder = isParamMode
    ? `Select: ${paramMode.command.label}...`
    : 'Type a command...';

  return (
    <div
      className={`cmd-palette ${closing ? 'cmd-palette--closing' : ''}`}
      onKeyDown={handleKeyDown}
    >
      <div className="cmd-palette__backdrop" onClick={handleClose} />
      <div className="cmd-palette__dialog">
        {/* Search input */}
        <div className="cmd-palette__search">
          <Search size={18} className="cmd-palette__search-icon" />
          {isParamMode && (
            <span className="cmd-palette__param-badge">
              {paramMode.command.label}
              <ChevronRight size={12} />
            </span>
          )}
          <input
            ref={inputRef}
            type="text"
            className="cmd-palette__input"
            placeholder={placeholder}
            value={displayQuery}
            onChange={(e) => {
              if (isParamMode) {
                setParamQuery(e.target.value);
                setParamIndex(0);
              } else {
                setQuery(e.target.value);
                setActiveIndex(0);
              }
            }}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* Results list – key so content animates when query/paramQuery changes */}
        <div className="cmd-palette__list" ref={listRef}>
          <div
            key={`${isParamMode ? 'param' : 'cmd'}-${isParamMode ? paramQuery : query}`}
            className="cmd-palette__list-content"
          >
            {loadingParams && (
              <div className="cmd-palette__empty">Loading...</div>
            )}

            {isParamMode && !loadingParams && (
              <>
                {filteredParams.length === 0 ? (
                  <div className="cmd-palette__empty">No options found</div>
                ) : (
                  filteredParams.map((param, idx) => (
                    <button
                      key={param.id}
                      type="button"
                      className={`cmd-palette__item ${idx === paramIndex ? 'cmd-palette__item--active' : ''}`}
                      onClick={() => executeCommand(param)}
                      onMouseEnter={() => setParamIndex(idx)}
                    >
                      <span className="cmd-palette__item-label">{param.label}</span>
                      {param.description && (
                        <span className="cmd-palette__item-desc">{param.description}</span>
                      )}
                      {idx === paramIndex && (
                        <CornerDownLeft size={14} className="cmd-palette__item-enter" />
                      )}
                    </button>
                  ))
                )}
              </>
            )}

            {!isParamMode && !loadingParams && (
              <>
                {groupedCommands.groups.length === 0 ? (
                  <div className="cmd-palette__empty">No commands found</div>
                ) : (
                  groupedCommands.groups.map((group) => (
                    <div key={group.category} className="cmd-palette__group">
                      <div className="cmd-palette__group-label">{group.category}</div>
                      {group.items.map((cmd) => {
                        const Icon = cmd.icon;
                        const isActive = cmd._flatIndex === activeIndex;
                        return (
                          <button
                            key={cmd.id}
                            type="button"
                            className={`cmd-palette__item ${isActive ? 'cmd-palette__item--active' : ''}`}
                            onClick={() => executeCommand(cmd)}
                            onMouseEnter={() => setActiveIndex(cmd._flatIndex)}
                          >
                            {Icon && <Icon size={16} className="cmd-palette__item-icon" />}
                            <span className="cmd-palette__item-label">{cmd.label}</span>
                            {cmd.getParams && (
                              <ChevronRight size={14} className="cmd-palette__item-chevron" />
                            )}
                            {isActive && !cmd.getParams && (
                              <CornerDownLeft size={14} className="cmd-palette__item-enter" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer hints */}
        <div className="cmd-palette__footer">
          <div className="cmd-palette__hint">
            <ArrowUp size={12} />
            <ArrowDown size={12} />
            <span>navigate</span>
          </div>
          <div className="cmd-palette__hint">
            <CornerDownLeft size={12} />
            <span>select</span>
          </div>
          <div className="cmd-palette__hint">
            <span className="cmd-palette__hint-key">esc</span>
            <span>{isParamMode ? 'back' : 'close'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
