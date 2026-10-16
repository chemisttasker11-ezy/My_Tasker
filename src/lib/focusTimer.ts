/**
 * Focus Timer: pure functions for ADHD single-task focus mode.
 * Supports start, pause, addMinutes, and elapsed calculation.
 */

export interface FocusTimer {
  readonly isRunning: boolean;
  readonly startedAt: number | null; // Timestamp (ms) when current run started
  readonly accumulatedMs: number;     // Elapsed ms prior to current run
  readonly extraMinutes: number;      // Extra minutes added via addMinutes
  readonly estimateMin?: number;      // Optional initial estimate in minutes
}

/**
 * Creates a new focus timer state.
 */
export function createFocusTimer(
  estimateMinOrInitial?: number | Partial<FocusTimer>
): FocusTimer {
  if (typeof estimateMinOrInitial === 'number') {
    return {
      isRunning: false,
      startedAt: null,
      accumulatedMs: 0,
      extraMinutes: 0,
      estimateMin: estimateMinOrInitial,
    };
  }
  return {
    isRunning: false,
    startedAt: null,
    accumulatedMs: 0,
    extraMinutes: 0,
    ...estimateMinOrInitial,
  };
}

/**
 * Starts or resumes the timer. Pure function returning a new timer state.
 * If already running, returns the existing state unchanged.
 */
export function start(timer: FocusTimer, now: number = Date.now()): FocusTimer {
  if (timer.isRunning) {
    return timer;
  }
  return {
    ...timer,
    isRunning: true,
    startedAt: now,
  };
}

/**
 * Pauses the timer and accumulates elapsed time. Pure function returning a new timer state.
 * If not running, returns the existing state unchanged.
 */
export function pause(timer: FocusTimer, now: number = Date.now()): FocusTimer {
  if (!timer.isRunning || timer.startedAt === null) {
    return timer;
  }
  const delta = Math.max(0, now - timer.startedAt);
  return {
    ...timer,
    isRunning: false,
    startedAt: null,
    accumulatedMs: timer.accumulatedMs + delta,
  };
}

/**
 * Adds minutes (e.g. +5 min) to the timer's extraMinutes/target.
 * Pure function returning a new timer state.
 */
export function addMinutes(timer: FocusTimer, minutes: number = 5): FocusTimer {
  const safeMinutes = Math.max(0, minutes);
  return {
    ...timer,
    extraMinutes: timer.extraMinutes + safeMinutes,
    estimateMin: timer.estimateMin !== undefined ? timer.estimateMin + safeMinutes : undefined,
  };
}

/**
 * Calculates total elapsed milliseconds up to `now`.
 * Pure function.
 */
export function elapsed(timer: FocusTimer, now: number = Date.now()): number {
  if (!timer.isRunning || timer.startedAt === null) {
    return timer.accumulatedMs;
  }
  return timer.accumulatedMs + Math.max(0, now - timer.startedAt);
}

/**
 * Alias for elapsed in milliseconds.
 */
export const elapsedMs = elapsed;

/**
 * Calculates total elapsed whole seconds up to `now`.
 */
export function elapsedSeconds(timer: FocusTimer, now: number = Date.now()): number {
  return Math.floor(elapsed(timer, now) / 1000);
}

/**
 * Calculates total elapsed whole minutes up to `now`.
 */
export function elapsedMinutes(timer: FocusTimer, now: number = Date.now()): number {
  return Math.floor(elapsed(timer, now) / 60000);
}

/**
 * Returns the effective total estimate in minutes (base estimate + extra minutes).
 * Defaults to 25 minutes if neither base nor timer estimate is set.
 */
export function getEffectiveEstimate(timer: FocusTimer, fallbackEstimateMin?: number): number {
  if (fallbackEstimateMin !== undefined && fallbackEstimateMin > 0) {
    return fallbackEstimateMin + timer.extraMinutes;
  }
  if (timer.estimateMin !== undefined && timer.estimateMin > 0) {
    return timer.estimateMin;
  }
  return 25 + timer.extraMinutes;
}

/**
 * Formats milliseconds into mm:ss (e.g. 720000 -> "12:00").
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Formats the elapsed vs estimate string, e.g. "12 of 25 min".
 */
export function formatProgressText(
  timer: FocusTimer,
  baseEstimateMin?: number,
  now: number = Date.now()
): string {
  const currentMinutes = elapsedMinutes(timer, now);
  const totalMinutes = getEffectiveEstimate(timer, baseEstimateMin);
  return `${currentMinutes} of ${totalMinutes} min`;
}

/**
 * Calculates progress as an integer percentage (0 to 100).
 */
export function progressPercent(
  timer: FocusTimer,
  baseEstimateMin?: number,
  now: number = Date.now()
): number {
  const totalMinutes = getEffectiveEstimate(timer, baseEstimateMin);
  if (totalMinutes <= 0) return 0;
  const currentMs = elapsed(timer, now);
  const totalMs = totalMinutes * 60 * 1000;
  return Math.min(100, Math.max(0, Math.round((currentMs / totalMs) * 100)));
}
