/**
 * XORNG Template Task
 * 
 * Template for building task execution sub-agents.
 */

// Base task executor class
export { BaseTaskExecutor } from './base/BaseTaskExecutor.js';

// Task types
export { BaseTask, type TaskResult } from './tasks/BaseTask.js';

// Types
export * from './types/index.js';

// Utilities
export { createTaskServer, startTaskExecutor } from './server.js';
export { 
  TaskQueue,
  type QueuedTask,
} from './utils/queue.js';
export {
  TaskHistory,
  type TaskRecord,
} from './utils/history.js';
