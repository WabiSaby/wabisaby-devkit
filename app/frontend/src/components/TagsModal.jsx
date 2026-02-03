import React, { useState, useEffect } from 'react';
import { X, Plus, Tag } from 'lucide-react';
import { projects } from '../lib/wails';

export function TagsModal({ projectName, onClose }) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [tagName, setTagName] = useState('');
  const [tagMessage, setTagMessage] = useState('');
  const [push, setPush] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectName || !window.go) {
      const t = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    projects
      .listTags(projectName)
      .then(({ success, data }) => {
        if (!cancelled && success && data?.tags) setTags(data.tags);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectName]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!tagName.trim()) return;
    setCreating(true);
    setError('');
    const { success, message } = await projects.createTag(
      projectName,
      tagName.trim(),
      tagMessage.trim() || `Release ${tagName.trim()}`,
      push
    );
    setCreating(false);
    if (success) {
      setTagName('');
      setTagMessage('');
      setPush(false);
      const { success: s2, data } = await projects.listTags(projectName);
      if (s2 && data?.tags) setTags(data.tags);
    } else {
      setError(message || 'Failed to create tag');
    }
  };

  return (
    <div className="modal tags-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__backdrop" aria-hidden />
      <div className="modal__dialog tags-modal__dialog" style={{ maxWidth: '30rem' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title tags-modal__title">
            <span className="tags-modal__title-icon">
              <Tag size={18} />
            </span>
            Tags — {projectName}
          </h3>
          <button type="button" onClick={onClose} className="modal__close" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal__form">
          {loading ? (
            <p className="modal__section-title">Loading tags...</p>
          ) : (
            <div className="modal__section">
              <p className="modal__section-title">Existing tags</p>
              {tags.length === 0 ? (
                <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>No tags yet.</p>
              ) : (
                <ul className="modal__list tags-modal__tag-list">
                  {tags.map((t, i) => (
                    <li key={i} className="tags-modal__tag">
                      <Tag size={14} />
                      <span>{typeof t === 'string' ? t : t.name || t}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {window.go && (
            <form onSubmit={handleCreate} className="modal__section modal__divider">
              <p className="modal__section-title">Create tag</p>
              <input
                type="text"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="e.g. v1.0.0"
                className="input"
              />
              <input
                type="text"
                value={tagMessage}
                onChange={(e) => setTagMessage(e.target.value)}
                placeholder="Message (optional)"
                className="input"
              />
              <label className="checkbox-label" style={{ marginTop: 'var(--space-3)' }}>
                <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} />
                Push to remote
              </label>
              {error && <p className="form-error">{error}</p>}
              <button type="submit" disabled={creating || !tagName.trim()} className="btn btn--primary" style={{ marginTop: 'var(--space-3)' }}>
                <Plus size={14} />
                Create tag
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
