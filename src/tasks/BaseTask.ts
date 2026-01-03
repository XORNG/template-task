import { z, ZodType } from 'zod';
import type { TaskContext } from '../types/index.js';

/**
 * Result from task execution
 */
export interface TaskResult<T = unknown> {
  success: boolean;
  output?: T;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Base class for tasks
 * 
 * Tasks are reusable units of work with:
 * - Input validation
 * - Progress reporting
 * - Cancellation support
 */
export abstract class BaseTask<TInput, TOutput> {
  public readonly type: string;
  public readonly name: string;
  public readonly description: string;
  public readonly inputSchema: ZodType<TInput>;

  constructor(
    type: string,
    name: string,
    description: string,
    inputSchema: ZodType<TInput>
  ) {
    this.type = type;
    this.name = name;
    this.description = description;
    this.inputSchema = inputSchema;
  }

  /**
   * Execute the task
   */
  async execute(input: unknown, context: TaskContext): Promise<TaskResult<TOutput>> {
    const { logger, signal, taskId } = context;

    // Check for cancellation before starting
    if (signal.aborted) {
      return { success: false, error: 'Task cancelled before execution' };
    }

    logger.debug({ taskId, type: this.type }, 'Executing task');

    try {
      // Validate input
      const parseResult = this.inputSchema.safeParse(input);
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid input: ${parseResult.error.errors.map(e => e.message).join(', ')}`,
        };
      }

      // Run the task
      const output = await this.run(parseResult.data, context);

      logger.debug({ taskId, type: this.type }, 'Task completed successfully');

      return { success: true, output };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ taskId, type: this.type, error: errorMessage }, 'Task failed');

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Implement the actual task logic
   */
  protected abstract run(input: TInput, context: TaskContext): Promise<TOutput>;

  /**
   * Check if cancellation has been requested
   */
  protected checkCancellation(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new Error('Task cancelled');
    }
  }

  /**
   * Sleep with cancellation support
   */
  protected async sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      
      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Task cancelled'));
      }, { once: true });
    });
  }

  /**
   * Run with timeout
   */
  protected async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    signal: AbortSignal
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Task cancelled'));
      }, { once: true });

      operation()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }
}

/**
 * Create a simple task from a function
 */
export function createTask<TInput, TOutput>(
  type: string,
  name: string,
  description: string,
  inputSchema: ZodType<TInput>,
  handler: (input: TInput, context: TaskContext) => Promise<TOutput>
): BaseTask<TInput, TOutput> {
  class SimpleTask extends BaseTask<TInput, TOutput> {
    protected async run(input: TInput, context: TaskContext): Promise<TOutput> {
      return handler(input, context);
    }
  }

  return new SimpleTask(type, name, description, inputSchema);
}
