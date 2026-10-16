/** Stable compatibility facade. Domain logic lives in src/domain; consumers should
 * import the nearest owning module as they migrate, never add new logic here. */
export type * from './domain/types';
export { LANES, CATEGORIES } from './domain/constants';
export { generateId, brisbaneToday, periodKey, nextDueDate } from './domain/time';
export { isCompleted, toggleCompletion, rescheduleTask, duplicateTask, setTaskStatus, saveTaskChanges, moveInBoard } from './domain/taskActions';
export { SUGGESTIONS, createTask, initialState } from './domain/factory';
export { STORAGE_KEY, readState } from './domain/localStore';
export { validateImported } from './domain/validation';
export { setWeekCommitment, toggleDailyFocus, saveWeekReview } from './domain/weekActions';
