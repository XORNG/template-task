import {
  BaseSubAgent,
  type SubAgentMetadata,
  type SubAgentConfig,
  type ProcessRequest,
  createToolHandler,
} from '@xorng/template-base';
import { z } from 'zod';
import { BaseTask, type TaskResult } from '../tasks/BaseTask.js';
import { TaskQueue, type QueuedTask } from '../utils/queue.js';
import { TaskHistory, type TaskRecord } from '../utils/history.js';
import type {
  TaskStatus,
  TaskPriority,
  TaskExecutionResult,
  TaskExecutorConfig,
  TaskExecutorConfigSchema,
  TaskContext,
  TaskProgress,
} from '../types/index.js';

/**
 * Base class for task executor sub-agents
 * 
 * Provides task execution infrastructure:
 * - Task registration
 * - Queue management
 * - Progress tracking
 * - History logging
 */
export abstract class BaseTaskExecutor extends BaseSubAgent {
  protected tasks: Map<string, BaseTask<unknown, unknown>> = new Map();
  protected queue: TaskQueue;
  protected history: TaskHistory;
  protected executorConfig: TaskExecutorConfig;
  protected runningTasks: Map<string, AbortController> = new Map();

  constructor(
    metadata: SubAgentMetadata,
    config?: SubAgentConfig,
    executorConfig?: TaskExecutorConfig
  ) {
    // Ensure 'execute' capability
    const capabilities = metadata.capabilities.includes('execute')
      ? metadata.capabilities
      : [...metadata.capabilities, 'execute' as const];

    super({ ...metadata, capabilities }, config);
    
    this.executorConfig = executorConfig || {
      maxConcurrent: 5,
      defaultTimeout: 60000,
      defaultRetries: 3,
      queueSize: 100,
    };

    this.queue = new TaskQueue(this.executorConfig.queueSize);
    this.history = new TaskHistory();

    // Register standard tools
    this.registerStandardTools();
  }

  /**
   * Register a task type
   */
  protected registerTask(task: BaseTask<unknown, unknown>): void {
    if (this.tasks.has(task.type)) {
      this.logger.warn({ task: task.type }, 'Overwriting existing task type');
    }
    this.tasks.set(task.type, task);
    this.logger.debug({ task: task.type }, 'Task type registered');
  }

  /**
   * Get all registered task types
   */
  getTaskTypes(): Map<string, BaseTask<unknown, unknown>> {
    return this.tasks;
  }

  /**
   * Execute a task
   */
  async executeTask(
    type: string,
    params: Record<string, unknown>,
    options?: {
      priority?: TaskPriority;
      timeout?: number;
      retries?: number;
    }
  ): Promise<TaskExecutionResult> {
    const taskId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    // Get task handler
    const task = this.tasks.get(type);
    if (!task) {
      return {
        taskId,
        status: 'failed',
        error: `Unknown task type: ${type}`,
        startedAt,
        completedAt: new Date().toISOString(),
        retryCount: 0,
      };
    }

    const abortController = new AbortController();
    this.runningTasks.set(taskId, abortController);

    const timeout = options?.timeout || this.executorConfig.defaultTimeout || 60000;
    const maxRetries = options?.retries ?? this.executorConfig.defaultRetries ?? 3;

    let retryCount = 0;
    let lastError: string | undefined;

    // Set up timeout
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, timeout);

    try {
      while (retryCount <= maxRetries) {
        const context: TaskContext = {
          taskId,
          requestId,
          logger: this.logger.child({ taskId, type }),
          signal: abortController.signal,
          reportProgress: (progress, message) => {
            this.onProgress({ taskId, progress, message, timestamp: new Date().toISOString() });
          },
        };

        const result = await task.execute(params, context);

        if (result.success) {
          clearTimeout(timeoutId);
          this.runningTasks.delete(taskId);

          const executionResult: TaskExecutionResult = {
            taskId,
            status: 'completed',
            output: result.output,
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - new Date(startedAt).getTime(),
            retryCount,
            metadata: result.metadata,
          };

          this.history.add(executionResult);
          return executionResult;
        }

        lastError = result.error;
        retryCount++;

        if (retryCount <= maxRetries) {
          this.logger.warn({ taskId, retryCount, error: lastError }, 'Retrying task');
          await this.sleep(Math.pow(2, retryCount) * 1000);
        }
      }

      // All retries exhausted
      clearTimeout(timeoutId);
      this.runningTasks.delete(taskId);

      const failedResult: TaskExecutionResult = {
        taskId,
        status: 'failed',
        error: lastError,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(startedAt).getTime(),
        retryCount,
      };

      this.history.add(failedResult);
      return failedResult;
    } catch (error) {
      clearTimeout(timeoutId);
      this.runningTasks.delete(taskId);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const status: TaskStatus = errorMessage.includes('cancelled') ? 'cancelled' : 'failed';

      const errorResult: TaskExecutionResult = {
        taskId,
        status,
        error: errorMessage,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(startedAt).getTime(),
        retryCount,
      };

      this.history.add(errorResult);
      return errorResult;
    }
  }

  /**
   * Cancel a running task
   */
  cancelTask(taskId: string): boolean {
    const controller = this.runningTasks.get(taskId);
    if (controller) {
      controller.abort();
      this.runningTasks.delete(taskId);
      return true;
    }
    return false;
  }

  /**
   * Get task history
   */
  getHistory(limit?: number): TaskRecord[] {
    return this.history.getRecent(limit);
  }

  /**
   * Called when task reports progress
   */
  protected onProgress(progress: TaskProgress): void {
    this.logger.debug(progress, 'Task progress');
  }

  /**
   * Register standard execution tools
   */
  private registerStandardTools(): void {
    // Execute task tool
    this.registerTool(createToolHandler({
      name: 'execute',
      description: 'Execute a task',
      inputSchema: z.object({
        type: z.string().describe('Task type to execute'),
        params: z.record(z.unknown()).describe('Task parameters'),
        options: z.object({
          priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
          timeout: z.number().optional(),
          retries: z.number().optional(),
        }).optional(),
      }),
      handler: async (input) => {
        return this.executeTask(input.type, input.params, input.options);
      },
    }));

    // Cancel task tool
    this.registerTool(createToolHandler({
      name: 'cancel',
      description: 'Cancel a running task',
      inputSchema: z.object({
        taskId: z.string().describe('Task ID to cancel'),
      }),
      handler: async (input) => {
        const cancelled = this.cancelTask(input.taskId);
        return { cancelled, taskId: input.taskId };
      },
    }));

    // List task types tool
    this.registerTool(createToolHandler({
      name: 'list-tasks',
      description: 'List available task types',
      inputSchema: z.object({}),
      handler: async () => {
        const tasks: Array<{
          type: string;
          name: string;
          description: string;
        }> = [];

        for (const [type, task] of this.tasks) {
          tasks.push({
            type,
            name: task.name,
            description: task.description,
          });
        }

        return { tasks };
      },
    }));

    // Get history tool
    this.registerTool(createToolHandler({
      name: 'history',
      description: 'Get task execution history',
      inputSchema: z.object({
        limit: z.number().optional().describe('Maximum number of records'),
      }),
      handler: async (input) => {
        return { history: this.getHistory(input.limit) };
      },
    }));
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Handle process requests
   */
  protected async handleRequest(
    request: ProcessRequest,
    requestId: string
  ): Promise<unknown> {
    if (request.type === 'execute') {
      const options = request.options as { 
        taskType?: string; 
        params?: Record<string, unknown>;
      } | undefined;
      
      return this.executeTask(
        options?.taskType || 'default',
        options?.params || {},
      );
    }

    // Delegate to tool execution
    return this.executeTool(request.type, request, requestId);
  }
}
