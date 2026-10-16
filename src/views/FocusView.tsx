import { useEffect, useRef, useState } from 'react';
import { Check, Circle, Pause, Play, Plus } from 'lucide-react';
import {
  addMinutes,
  createFocusTimer,
  elapsed,
  formatProgressText,
  formatTime,
  pause,
  progressPercent,
  start,
  type FocusTimer,
} from '../lib/focusTimer';
import '../styles/focus.css';

export interface FocusViewProps {
  title: string;
  notes?: string;
  checklist: { id: string; text: string; done: boolean }[];
  estimateMin?: number;
  onToggleItem(id: string): void;
  onDone(): void;
  onExit(): void;
}

export function FocusView({
  title,
  notes,
  checklist = [],
  estimateMin,
  onToggleItem,
  onDone,
  onExit,
}: FocusViewProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Timer is pure functions; component uses 1s interval only while running
  const [timer, setTimer] = useState<FocusTimer>(() => createFocusTimer(estimateMin));
  const [now, setNow] = useState<number>(() => Date.now());
  const [isTimerVisible, setIsTimerVisible] = useState(false);

  // Esc exits focus mode
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onExit();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit]);

  // Focus moves to the title on open
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Interval runs only while the timer is actively running
  useEffect(() => {
    if (!timer.isRunning) return;
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [timer.isRunning]);

  const handleStart = () => {
    const currentTime = Date.now();
    setNow(currentTime);
    setTimer(prev => start(prev, currentTime));
    setIsTimerVisible(true);
  };

  const handlePause = () => {
    const currentTime = Date.now();
    setNow(currentTime);
    setTimer(prev => pause(prev, currentTime));
  };

  const handleAdd5Min = () => {
    setTimer(prev => addMinutes(prev, 5));
  };

  const currentElapsedMs = elapsed(timer, now);
  const clockText = formatTime(currentElapsedMs);
  const progressText = formatProgressText(timer, estimateMin, now);
  const pct = progressPercent(timer, estimateMin, now);

  return (
    <div className="focus-view" role="region" aria-label="Focus mode">
      <div className="focus-container">
        <header className="focus-header">
          <p className="focus-gentle-copy">One thing at a time. You've got this.</p>
          <h1 ref={titleRef} tabIndex={-1} className="focus-title">
            {title}
          </h1>
        </header>

        {notes && (
          <section className="focus-notes" aria-label="Task notes">
            <p>{notes}</p>
          </section>
        )}

        {checklist && checklist.length > 0 && (
          <section className="focus-checklist-section" aria-labelledby="focus-checklist-heading">
            <h2 id="focus-checklist-heading" className="focus-checklist-heading">
              Checklist ({checklist.filter(item => item.done).length}/{checklist.length})
            </h2>
            <ul className="focus-checklist" role="list">
              {checklist.map(item => (
                <li
                  key={item.id}
                  className={`focus-checklist-item ${item.done ? 'is-done' : ''}`}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.done}
                    aria-label={`${item.done ? 'Mark incomplete:' : 'Mark complete:'} ${item.text}`}
                    className={`focus-check-target ${item.done ? 'is-checked' : ''}`}
                    onClick={() => onToggleItem(item.id)}
                  >
                    {item.done ? (
                      <Check size={22} strokeWidth={2.5} aria-hidden="true" />
                    ) : (
                      <Circle size={22} strokeWidth={2} aria-hidden="true" />
                    )}
                  </button>
                  <span
                    className={`focus-item-label ${item.done ? 'is-done' : ''}`}
                    onClick={() => onToggleItem(item.id)}
                  >
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Optional timer: hidden until Start */}
        <section className="focus-timer-section" aria-label="Focus timer">
          {!isTimerVisible ? (
            <div className="focus-timer-unstarted">
              <div className="focus-timer-prompt-group">
                <span className="focus-timer-prompt">Optional timer</span>
                <span className="focus-timer-subprompt">Track your focus time at your own pace</span>
              </div>
              <button
                type="button"
                className="focus-btn focus-btn-secondary"
                onClick={handleStart}
                aria-label="Start timer"
              >
                <Play size={18} aria-hidden="true" />
                <span>Start</span>
              </button>
            </div>
          ) : (
            <div className="focus-timer-card">
              <div className="focus-timer-display">
                <div className="focus-timer-time-row">
                  <span className="focus-timer-clock" aria-label={`Elapsed time: ${clockText}`}>
                    {clockText}
                  </span>
                  <span className="focus-timer-estimate-text">
                    {progressText}
                  </span>
                </div>
                <div
                  className="focus-progress-track"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuetext={progressText}
                >
                  <div className="focus-progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>

              <div className="focus-timer-controls">
                {timer.isRunning ? (
                  <button
                    type="button"
                    className="focus-btn focus-btn-secondary"
                    onClick={handlePause}
                    aria-label="Pause timer"
                  >
                    <Pause size={18} aria-hidden="true" />
                    <span>Pause</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="focus-btn focus-btn-secondary"
                    onClick={handleStart}
                    aria-label="Start timer"
                  >
                    <Play size={18} aria-hidden="true" />
                    <span>Start</span>
                  </button>
                )}
                <button
                  type="button"
                  className="focus-btn focus-btn-secondary"
                  onClick={handleAdd5Min}
                  aria-label="Add 5 minutes to timer"
                >
                  <Plus size={18} aria-hidden="true" />
                  <span>+5 min</span>
                </button>
              </div>
            </div>
          )}
        </section>

        <footer className="focus-actions">
          <button
            type="button"
            className="focus-btn focus-btn-exit"
            onClick={onExit}
            aria-label="Exit focus mode"
          >
            Not now
          </button>
          <button
            type="button"
            className="focus-btn focus-btn-primary"
            onClick={onDone}
            aria-label="Complete task and exit"
          >
            <Check size={18} strokeWidth={2.5} aria-hidden="true" />
            <span>Done</span>
          </button>
        </footer>
      </div>
    </div>
  );
}

export default FocusView;
