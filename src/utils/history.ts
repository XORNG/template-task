import type { TaskExecutionResult, TaskStatus } from '../types/index.js';

/**
 * Task history record
 */
export interface TaskRecord extends TaskExecutionResult {
  recordedAt: string;
}

/**
 * Task execution history
 */
export class TaskHistory {
  private records: TaskRecord[] = [];
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Add a record to history
   */
  add(result: TaskExecutionResult): void {
    const record: TaskRecord = {
      ...result,
      recordedAt: new Date().toISOString(),
    };

    this.records.unshift(record);

    // Trim if over max size
    if (this.records.length > this.maxSize) {
      this.records = this.records.slice(0, this.maxSize);
    }
  }

  /**
   * Get recent records
   */
  getRecent(limit: number = 50): TaskRecord[] {
    return this.records.slice(0, limit);
  }

  /**
   * Get record by task ID
   */
  getByTaskId(taskId: string): TaskRecord | undefined {
    return this.records.find(r => r.taskId === taskId);
  }

  /**
   * Get records by status
   */
  getByStatus(status: TaskStatus, limit?: number): TaskRecord[] {
    const filtered = this.records.filter(r => r.status === status);
    return limit ? filtered.slice(0, limit) : filtered;
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    avgDurationMs: number;
    successRate: number;
  } {
    const total = this.records.length;
    const completed = this.records.filter(r => r.status === 'completed').length;
    const failed = this.records.filter(r => r.status === 'failed').length;
    const cancelled = this.records.filter(r => r.status === 'cancelled').length;

    const durations = this.records
      .filter(r => r.durationMs !== undefined)
      .map(r => r.durationMs as number);

    const avgDurationMs = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const successRate = total > 0 ? completed / total : 0;

    return {
      total,
      completed,
      failed,
      cancelled,
      avgDurationMs: Math.round(avgDurationMs),
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  /**
   * Clear history
   */
  clear(): void {
    this.records = [];
  }

  /**
   * Get all records
   */
  all(): TaskRecord[] {
    return [...this.records];
  }
}
