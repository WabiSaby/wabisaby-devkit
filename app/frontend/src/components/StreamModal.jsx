import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function StreamModal({ title, lines, onClose, isActive }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__backdrop" aria-hidden />
      <div className="modal__dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">{title}</h3>
          <div className="modal__actions">
            {isActive && <span className="modal__status">Running...</span>}
            <button type="button" onClick={onClose} className="modal__close" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="modal__body modal__body--pre">
          {lines.length === 0 && !isActive && (
            <span style={{ color: 'var(--text-muted)' }}>No output yet.</span>
          )}
          {lines.map((line, i) => (
            <div key={i} className="stream-line">
              {line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
