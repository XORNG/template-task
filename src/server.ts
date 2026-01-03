import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLogger, registerTools, type Logger } from '@xorng/template-base';
import { BaseTaskExecutor } from './base/BaseTaskExecutor.js';

/**
 * Options for creating a task executor server
 */
export interface TaskServerOptions {
  executor: BaseTaskExecutor;
  logLevel?: string;
}

/**
 * Create and start an MCP server for a task executor
 */
export function createTaskServer(options: TaskServerOptions): {
  server: McpServer;
  transport: StdioServerTransport;
  logger: Logger;
  start: () => Promise<void>;
} {
  const { executor, logLevel = 'info' } = options;
  const metadata = executor.getMetadata();
  
  const logger = createLogger(logLevel, metadata.name);

  const server = new McpServer({
    name: metadata.name,
    version: metadata.version,
    capabilities: {
      tools: {},
    },
  });

  const transport = new StdioServerTransport();

  // Register all executor tools
  registerTools(server, executor.getTools(), logger);

  const start = async () => {
    await executor.initialize();
    
    logger.info({
      name: metadata.name,
      version: metadata.version,
      taskTypes: Array.from(executor.getTaskTypes().keys()),
    }, 'Starting task executor MCP server');

    await server.connect(transport);
    
    logger.info('Task executor MCP server connected');

    // Handle shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down...');
      await executor.shutdown();
      process.exit(0);
    });
  };

  return { server, transport, logger, start };
}

/**
 * Quick start helper for task executors
 */
export async function startTaskExecutor(executor: BaseTaskExecutor): Promise<void> {
  const { start } = createTaskServer({ executor });
  await start();
}
