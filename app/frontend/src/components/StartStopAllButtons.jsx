import React from 'react';
import { Play, Square } from 'lucide-react';

/**
 * Reusable "Start all" / "Stop all" action buttons.
 * Same size and styling across Infrastructure, Services, and Core views.
 */
export function StartStopAllButtons({ onStart, onStop, titleStart = 'Start all', titleStop = 'Stop all' }) {
  return (
    <>
      <button type="button" onClick={onStart} className="btn btn--success" title={titleStart}>
        <Play size={14} />
        Start all
      </button>
      <button type="button" onClick={onStop} className="btn btn--danger" title={titleStop}>
        <Square size={14} />
        Stop all
      </button>
    </>
  );
}
