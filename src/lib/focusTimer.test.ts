import { describe, expect, it } from 'vitest';
import {
  addMinutes,
  createFocusTimer,
  elapsed,
  elapsedMinutes,
  elapsedSeconds,
  formatProgressText,
  formatTime,
  getEffectiveEstimate,
  pause,
  progressPercent,
  start,
} from './focusTimer';

describe('focusTimer pure functions', () => {
  it('creates initial timer state with sensible defaults', () => {
    const timer = createFocusTimer();
    expect(timer.isRunning).toBe(false);
    expect(timer.startedAt).toBeNull();
    expect(timer.accumulatedMs).toBe(0);
    expect(timer.extraMinutes).toBe(0);
    expect(timer.estimateMin).toBeUndefined();
  });

  it('creates initial timer with provided estimate minutes', () => {
    const timer = createFocusTimer(30);
    expect(timer.estimateMin).toBe(30);
    expect(timer.isRunning).toBe(false);
  });

  it('starts a stopped timer at specified now timestamp', () => {
    const initial = createFocusTimer(25);
    const t0 = 1000;
    const running = start(initial, t0);

    expect(running.isRunning).toBe(true);
    expect(running.startedAt).toBe(t0);
    expect(running.accumulatedMs).toBe(0);
  });

  it('start is idempotent when already running', () => {
    const t0 = 1000;
    const running = start(createFocusTimer(25), t0);
    const runningAgain = start(running, t0 + 5000);

    expect(runningAgain.startedAt).toBe(t0);
    expect(runningAgain).toBe(running);
  });

  it('pauses a running timer and accumulates elapsed time', () => {
    const t0 = 10_000;
    const running = start(createFocusTimer(), t0);
    const paused = pause(running, t0 + 4_000);

    expect(paused.isRunning).toBe(false);
    expect(paused.startedAt).toBeNull();
    expect(paused.accumulatedMs).toBe(4_000);
  });

  it('pause is idempotent when already stopped', () => {
    const timer = createFocusTimer();
    const paused = pause(timer, 5000);
    expect(paused).toBe(timer);
  });

  it('computes elapsed time correctly across multiple runs', () => {
    const timer0 = createFocusTimer();
    expect(elapsed(timer0, 1000)).toBe(0);

    // Run 1: 0s to 5s (5000ms)
    const run1 = start(timer0, 1000);
    expect(elapsed(run1, 3500)).toBe(2500);

    const pause1 = pause(run1, 6000);
    expect(elapsed(pause1, 7000)).toBe(5000);

    // Run 2: resume at 10s, now is 13s (3000ms additional -> 8000ms total)
    const run2 = start(pause1, 10_000);
    expect(elapsed(run2, 13_000)).toBe(8_000);

    const pause2 = pause(run2, 14_000);
    expect(elapsed(pause2, 20_000)).toBe(9_000);
  });

  it('calculates elapsedSeconds and elapsedMinutes', () => {
    const timer = start(createFocusTimer(), 0);
    // 125 seconds = 2 min 5 sec = 125_000 ms
    expect(elapsedSeconds(timer, 125_000)).toBe(125);
    expect(elapsedMinutes(timer, 125_000)).toBe(2);
  });

  it('adds minutes (+5 min default) to extraMinutes and updates estimate', () => {
    const timer = createFocusTimer(20);
    const added1 = addMinutes(timer);
    expect(added1.extraMinutes).toBe(5);
    expect(added1.estimateMin).toBe(25);

    const added2 = addMinutes(added1, 10);
    expect(added2.extraMinutes).toBe(15);
    expect(added2.estimateMin).toBe(35);
  });

  it('getEffectiveEstimate falls back to 25 min if no estimate provided', () => {
    const timer = createFocusTimer();
    expect(getEffectiveEstimate(timer)).toBe(25);

    const withExtra = addMinutes(timer, 5);
    expect(getEffectiveEstimate(withExtra)).toBe(30);

    // Base estimate provided explicitly
    expect(getEffectiveEstimate(timer, 15)).toBe(15);
    expect(getEffectiveEstimate(withExtra, 15)).toBe(20);
  });

  it('formats digital clock time mm:ss', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(5000)).toBe('00:05');
    expect(formatTime(65_000)).toBe('01:05');
    expect(formatTime(720_000)).toBe('12:00');
  });

  it('formats progress text as "X of Y min"', () => {
    const timer = start(createFocusTimer(25), 0);
    // 12 minutes = 720,000 ms
    expect(formatProgressText(timer, 25, 720_000)).toBe('12 of 25 min');

    // With +5 min added
    const extended = addMinutes(timer, 5);
    expect(formatProgressText(extended, 25, 720_000)).toBe('12 of 30 min');
  });

  it('computes progress percentage clamped between 0 and 100', () => {
    const timer = start(createFocusTimer(25), 0);
    // 0 ms -> 0%
    expect(progressPercent(timer, 25, 0)).toBe(0);

    // 12.5 min = 750,000 ms -> 50%
    expect(progressPercent(timer, 25, 750_000)).toBe(50);

    // 25 min = 1,500,000 ms -> 100%
    expect(progressPercent(timer, 25, 1_500_000)).toBe(100);

    // Overtime: 30 min on a 25 min task is clamped to 100%
    expect(progressPercent(timer, 25, 1_800_000)).toBe(100);
  });
});
