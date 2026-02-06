import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';

export function StreamModal({ title, lines, onClose, isActive }) {
  const bottomRef = useRef(null);
  const dialogRef = useRef(null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

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

  return (
    <div
      className={`modal stream-modal${isClosing ? ' modal--closing' : ''}`}
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div className="modal__backdrop" aria-hidden />
      <div
        ref={dialogRef}
        className="modal__dialog stream-modal__dialog"
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={handleAnimationEnd}
      >
        <div className="modal__header">
          <h3 className="modal__title">{title}</h3>
          <div className="modal__actions">
            {isActive && <span className="modal__status">Running...</span>}
            <button type="button" onClick={handleClose} className="modal__close" aria-label="Close">
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
