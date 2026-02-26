import React from 'react';
import { Play, Square, Loader2 } from 'lucide-react';

/**
 * Reusable "Start all" / "Stop all" action buttons.
 * Same size and styling across Infrastructure, Services, and Core views.
 */
export function StartStopAllButtons({
  onStart,
  onStop,
  titleStart = 'Start all',
  titleStop = 'Stop all',
  isStarting = false,
  isStopping = false,
  disabled = false,
}) {
  const startDisabled = disabled || isStarting || isStopping;
  const stopDisabled = disabled || isStarting || isStopping;

  return (
    <div className="btn-group btn-group--pill">
      <button
        type="button"
        onClick={onStart}
        className={`btn btn--success btn--state ${isStarting ? 'btn--pending' : ''}`}
        title={titleStart}
        disabled={startDisabled}
        aria-busy={isStarting}
      >
        {isStarting ? <Loader2 size={14} className="icon-spin" /> : <Play size={14} />}
        {isStarting ? 'Starting' : 'Start all'}
      </button>
      <button
        type="button"
        onClick={onStop}
        className={`btn btn--danger btn--state ${isStopping ? 'btn--pending' : ''}`}
        title={titleStop}
        disabled={stopDisabled}
        aria-busy={isStopping}
      >
        {isStopping ? <Loader2 size={14} className="icon-spin" /> : <Square size={14} />}
        {isStopping ? 'Stopping' : 'Stop all'}
      </button>
    </div>
  );
}
