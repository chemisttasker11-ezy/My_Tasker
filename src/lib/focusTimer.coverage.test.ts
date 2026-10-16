import { expect, it } from 'vitest';
import { createFocusTimer, elapsedMs, start } from './focusTimer';

it('elapsedMs exposes milliseconds for empty, paused and running timers without mutation', () => {
  const empty = Object.freeze(createFocusTimer());
  expect(elapsedMs(empty, 1000)).toBe(0);
  const running = Object.freeze(start(empty, 1000));
  expect(elapsedMs(running, 2500)).toBe(1500);
  const paused = Object.freeze(createFocusTimer({ accumulatedMs: 1234 }));
  expect(elapsedMs(paused, 999999)).toBe(1234);
  expect(empty.isRunning).toBe(false); expect(running.accumulatedMs).toBe(0);
});
