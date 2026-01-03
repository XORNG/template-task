# XORNG Template Task

Template for building task execution sub-agents in the XORNG framework.

## Overview

`@xorng/template-task` provides infrastructure for action-oriented sub-agents:

- **BaseTaskExecutor** - Base class for task executor sub-agents
- **BaseTask** - Base class for task implementations
- **TaskQueue** - Priority queue for task management
- **TaskHistory** - Execution history tracking

## Installation

```bash
npm install @xorng/template-task
```

## Quick Start

```typescript
import {
  BaseTaskExecutor,
  BaseTask,
  startTaskExecutor,
  type TaskContext,
} from '@xorng/template-task';
import { z } from 'zod';

// Create a custom task
class FileWriteTask extends BaseTask<{ path: string; content: string }, { bytesWritten: number }> {
  constructor() {
    super(
      'file-write',
      'Write File',
      'Write content to a file',
      z.object({
        path: z.string(),
        content: z.string(),
      })
    );
  }

  protected async run(
    input: { path: string; content: string },
    context: TaskContext
  ): Promise<{ bytesWritten: number }> {
    const { logger, reportProgress, signal } = context;

    reportProgress(0, 'Starting file write');
    
    // Check for cancellation
    this.checkCancellation(signal);

    const fs = await import('fs/promises');
    await fs.writeFile(input.path, input.content);

    reportProgress(100, 'File written');

    return { bytesWritten: input.content.length };
  }
}

// Create the executor
class MyExecutor extends BaseTaskExecutor {
  constructor() {
    super({
      name: 'my-executor',
      version: '1.0.0',
      description: 'File operations executor',
      capabilities: ['execute'],
    });

    this.registerTask(new FileWriteTask());
  }
}

// Start the MCP server
startTaskExecutor(new MyExecutor());
```

## Building Tasks

### BaseTask

```typescript
abstract class BaseTask<TInput, TOutput> {
  constructor(
    type: string,
    name: string,
    description: string,
    inputSchema: ZodType<TInput>
  );

  // Called by executor
  async execute(input: unknown, context: TaskContext): Promise<TaskResult<TOutput>>;

  // Must implement
  protected abstract run(input: TInput, context: TaskContext): Promise<TOutput>;

  // Helper methods
  protected checkCancellation(signal: AbortSignal): void;
  protected sleep(ms: number, signal: AbortSignal): Promise<void>;
  protected withTimeout<T>(operation: () => Promise<T>, timeoutMs: number, signal: AbortSignal): Promise<T>;
}
```

### Task Context

```typescript
interface TaskContext {
  taskId: string;          // Unique task ID
  requestId: string;       // Request correlation ID
  logger: Logger;          // Task-specific logger
  signal: AbortSignal;     // Cancellation signal
  reportProgress: (progress: number, message?: string) => void;
}
```

### Example Tasks

**File operations task:**

```typescript
class FileReadTask extends BaseTask<{ path: string }, { content: string }> {
  constructor() {
    super('file-read', 'Read File', 'Read content from a file', z.object({
      path: z.string(),
    }));
  }

  protected async run(input: { path: string }, context: TaskContext): Promise<{ content: string }> {
    const fs = await import('fs/promises');
    const content = await fs.readFile(input.path, 'utf-8');
    return { content };
  }
}
```

**Shell command task:**

```typescript
class ShellTask extends BaseTask<
  { command: string; args?: string[] },
  { stdout: string; stderr: string; exitCode: number }
> {
  constructor() {
    super('shell', 'Execute Shell Command', 'Run a shell command', z.object({
      command: z.string(),
      args: z.array(z.string()).optional(),
    }));
  }

  protected async run(input, context): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
      const proc = spawn(input.command, input.args || [], { shell: true });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });
      
      proc.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code || 0 });
      });
      
      proc.on('error', reject);
      
      // Handle cancellation
      context.signal.addEventListener('abort', () => {
        proc.kill();
        reject(new Error('Task cancelled'));
      });
    });
  }
}
```

**Long-running task with progress:**

```typescript
class DataProcessingTask extends BaseTask<{ items: unknown[] }, { processed: number }> {
  constructor() {
    super('process-data', 'Process Data', 'Process items with progress reporting', z.object({
      items: z.array(z.unknown()),
    }));
  }

  protected async run(input, context): Promise<{ processed: number }> {
    const { items } = input;
    const { reportProgress, signal } = context;
    
    let processed = 0;
    
    for (const item of items) {
      // Check for cancellation
      this.checkCancellation(signal);
      
      // Process item
      await this.processItem(item);
      processed++;
      
      // Report progress
      const progress = Math.round((processed / items.length) * 100);
      reportProgress(progress, `Processed ${processed}/${items.length}`);
    }
    
    return { processed };
  }
  
  private async processItem(item: unknown): Promise<void> {
    // Processing logic
  }
}
```

## Building Task Executors

### BaseTaskExecutor

```typescript
abstract class BaseTaskExecutor extends BaseSubAgent {
  constructor(
    metadata: SubAgentMetadata,
    config?: SubAgentConfig,
    executorConfig?: TaskExecutorConfig
  );

  // Register task types
  protected registerTask(task: BaseTask): void;

  // Execute a task
  async executeTask(type: string, params: Record<string, unknown>, options?: TaskOptions): Promise<TaskExecutionResult>;

  // Cancel a task
  cancelTask(taskId: string): boolean;

  // Get history
  getHistory(limit?: number): TaskRecord[];

  // Built-in tools: 'execute', 'cancel', 'list-tasks', 'history'
}
```

### Configuration

```typescript
interface TaskExecutorConfig {
  maxConcurrent?: number;   // Max parallel tasks (default: 5)
  defaultTimeout?: number;  // Default timeout in ms (default: 60000)
  defaultRetries?: number;  // Default retry count (default: 3)
  queueSize?: number;       // Max queue size (default: 100)
}
```

## Types

### TaskExecutionResult

```typescript
interface TaskExecutionResult {
  taskId: string;
  status: TaskStatus;        // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  output?: unknown;          // Task output on success
  error?: string;            // Error message on failure
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  retryCount: number;
}
```

### TaskPriority

```typescript
type TaskPriority = 'low' | 'normal' | 'high' | 'critical';
```

## Utilities

### TaskQueue

Priority queue for managing tasks:

```typescript
const queue = new TaskQueue(100); // max 100 tasks

queue.add(taskDefinition);
const next = queue.next();     // Get and remove next task
const peek = queue.peek();     // Look at next without removing
queue.remove(taskId);          // Remove specific task
queue.size();                  // Current queue size
queue.isEmpty();               // Check if empty
queue.isFull();               // Check if full
```

### TaskHistory

Track execution history:

```typescript
const history = new TaskHistory(1000); // max 1000 records

history.add(executionResult);
const recent = history.getRecent(50);
const record = history.getByTaskId(taskId);
const failed = history.getByStatus('failed');
const stats = history.getStats();
// { total, completed, failed, cancelled, avgDurationMs, successRate }
```

## License

MIT
