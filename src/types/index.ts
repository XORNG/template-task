import { z } from 'zod';

/**
 * Task status
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export const TaskStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);

/**
 * Task priority
 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

export const TaskPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);

/**
 * Task definition
 */
export interface TaskDefinition {
  id: string;
  type: string;
  name: string;
  description: string;
  input: unknown;
  priority: TaskPriority;
  timeout?: number;
  retries?: number;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
}

export const TaskDefinitionSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  description: z.string(),
  input: z.unknown(),
  priority: TaskPrioritySchema,
  timeout: z.number().optional(),
  retries: z.number().optional(),
  dependencies: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Task execution result
 */
export interface TaskExecutionResult {
  taskId: string;
  status: TaskStatus;
  output?: unknown;
  error?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  retryCount: number;
  metadata?: Record<string, unknown>;
}

export const TaskExecutionResultSchema = z.object({
  taskId: z.string(),
  status: TaskStatusSchema,
  output: z.unknown().optional(),
  error: z.string().optional(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  durationMs: z.number().optional(),
  retryCount: z.number(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Task input for execution
 */
export interface TaskInput {
  type: string;
  params: Record<string, unknown>;
  options?: {
    priority?: TaskPriority;
    timeout?: number;
    retries?: number;
  };
}

export const TaskInputSchema = z.object({
  type: z.string(),
  params: z.record(z.unknown()),
  options: z.object({
    priority: TaskPrioritySchema.optional(),
    timeout: z.number().optional(),
    retries: z.number().optional(),
  }).optional(),
});

/**
 * Task executor configuration
 */
export interface TaskExecutorConfig {
  maxConcurrent?: number;
  defaultTimeout?: number;
  defaultRetries?: number;
  queueSize?: number;
}

export const TaskExecutorConfigSchema = z.object({
  maxConcurrent: z.number().optional().default(5),
  defaultTimeout: z.number().optional().default(60000),
  defaultRetries: z.number().optional().default(3),
  queueSize: z.number().optional().default(100),
});

/**
 * Task handler type
 */
export type TaskHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: TaskContext
) => Promise<TOutput>;

/**
 * Task context
 */
export interface TaskContext {
  taskId: string;
  requestId: string;
  logger: import('@xorng/template-base').Logger;
  signal: AbortSignal;
  reportProgress: (progress: number, message?: string) => void;
}

/**
 * Progress update
 */
export interface TaskProgress {
  taskId: string;
  progress: number; // 0-100
  message?: string;
  timestamp: string;
}

export const TaskProgressSchema = z.object({
  taskId: z.string(),
  progress: z.number().min(0).max(100),
  message: z.string().optional(),
  timestamp: z.string(),
});
