import React, { useState, useEffect, useRef, useCallback, useOptimistic } from 'react';
import { useFormStatus } from 'react-dom';
import { X, Plus, Tag } from 'lucide-react';
import { projects } from '../lib/wails';

function CreateTagSubmitButton({ disabled: disabledProp }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabledProp}
      className="btn btn--primary"
      style={{ marginTop: 'var(--space-3)' }}
    >
      <Plus size={14} />
      {pending ? 'Creating…' : 'Create tag'}
    </button>
  );
}

export function TagsModal({ projectName, onClose }) {
  const [tags, setTags] = useState([]);
  const [optimisticTags, addOptimisticTag] = useOptimistic(
    tags,
    (state: string[], newTag: unknown) => [...state, typeof newTag === 'string' ? newTag : (typeof newTag === 'object' && newTag !== null && 'name' in newTag ? (newTag as { name?: string }).name : undefined) ?? String(newTag)]
  );
  const [loading, setLoading] = useState(true);
  const [tagName, setTagName] = useState('');
  const [tagMessage, setTagMessage] = useState('');
  const [push, setPush] = useState(false);
  const [error, setError] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const dialogRef = useRef(null);
  const formRef = useRef(null);

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

  const createTagAction = useCallback(
    async (formData) => {
      const name = formData.get('tagName')?.toString().trim();
      if (!name) return;
      setError('');
      addOptimisticTag(name);
      const pushToRemote = formData.get('push') === 'on';
      const message = formData.get('tagMessage')?.toString().trim() || `Release ${name}`;
      const proj = formData.get('projectName')?.toString() || projectName;
      const { success, message: errMsg } = await projects.createTag(proj, name, message, pushToRemote);
      if (success) {
        formRef.current?.reset();
        setTagName('');
        setTagMessage('');
        setPush(false);
        const { success: s2, data } = await projects.listTags(proj);
        if (s2 && data?.tags) setTags(data.tags);
      } else {
        setError(errMsg || 'Failed to create tag');
      }
    },
    [projectName, addOptimisticTag]
  );

  return (
    <div
      className={`modal tags-modal${isClosing ? ' modal--closing' : ''}`}
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div className="modal__backdrop" aria-hidden />
      <div
        ref={dialogRef}
        className="modal__dialog tags-modal__dialog"
        style={{ maxWidth: '30rem' }}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={handleAnimationEnd}
      >
        <div className="modal__header">
          <h3 className="modal__title tags-modal__title">
            <span className="tags-modal__title-icon">
              <Tag size={18} />
            </span>
            Tags — {projectName}
          </h3>
          <button type="button" onClick={handleClose} className="modal__close" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal__form">
          {loading ? (
            <p className="modal__section-title">Loading tags...</p>
          ) : (
            <div className="modal__section">
              <p className="modal__section-title">Existing tags</p>
              {optimisticTags.length === 0 ? (
                <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>No tags yet.</p>
              ) : (
                <ul className="modal__list tags-modal__tag-list">
                  {optimisticTags.map((t, i) => (
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
            <form
              ref={formRef}
              action={createTagAction}
              className="modal__section modal__divider"
            >
              <input type="hidden" name="projectName" value={projectName} />
              <p className="modal__section-title">Create tag</p>
              <input
                type="text"
                name="tagName"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="e.g. v1.0.0"
                className="input"
              />
              <input
                type="text"
                name="tagMessage"
                value={tagMessage}
                onChange={(e) => setTagMessage(e.target.value)}
                placeholder="Message (optional)"
                className="input"
              />
              <label className="checkbox-label" style={{ marginTop: 'var(--space-3)' }}>
                <input
                  type="checkbox"
                  name="push"
                  checked={push}
                  onChange={(e) => setPush(e.target.checked)}
                />
                Push to remote
              </label>
              {error && <p className="form-error">{error}</p>}
              <CreateTagSubmitButton disabled={!tagName.trim()} />
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
