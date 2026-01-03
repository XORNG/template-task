import type { TaskPriority, TaskDefinition } from '../types/index.js';

/**
 * Queued task with priority
 */
export interface QueuedTask {
  id: string;
  task: TaskDefinition;
  addedAt: string;
  priority: number;
}

/**
 * Priority queue for tasks
 */
export class TaskQueue {
  private queue: QueuedTask[] = [];
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  /**
   * Add a task to the queue
   */
  add(task: TaskDefinition): boolean {
    if (this.queue.length >= this.maxSize) {
      return false;
    }

    const priorityValue = this.priorityToNumber(task.priority);

    const queuedTask: QueuedTask = {
      id: task.id,
      task,
      addedAt: new Date().toISOString(),
      priority: priorityValue,
    };

    // Insert in priority order
    const insertIndex = this.queue.findIndex(t => t.priority < priorityValue);
    if (insertIndex === -1) {
      this.queue.push(queuedTask);
    } else {
      this.queue.splice(insertIndex, 0, queuedTask);
    }

    return true;
  }

  /**
   * Get the next task from the queue
   */
  next(): QueuedTask | undefined {
    return this.queue.shift();
  }

  /**
   * Peek at the next task without removing it
   */
  peek(): QueuedTask | undefined {
    return this.queue[0];
  }

  /**
   * Remove a task from the queue
   */
  remove(taskId: string): boolean {
    const index = this.queue.findIndex(t => t.id === taskId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Check if queue is full
   */
  isFull(): boolean {
    return this.queue.length >= this.maxSize;
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Get all queued tasks
   */
  all(): QueuedTask[] {
    return [...this.queue];
  }

  /**
   * Convert priority string to number
   */
  private priorityToNumber(priority: TaskPriority): number {
    switch (priority) {
      case 'critical':
        return 4;
      case 'high':
        return 3;
      case 'normal':
        return 2;
      case 'low':
        return 1;
      default:
        return 2;
    }
  }
}
