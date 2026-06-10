#!/usr/bin/env node

import { McpProxyServer } from "./server.js";
import { BridgeServer } from "./bridge.js";
import {
  tryAcquireLock,
  readLock,
  releaseLock,
  isProcessAlive,
  cleanStaleLock,
} from "./singleton.js";

const DEFAULT_SINGLETON_PORT = 9200;

function getSingletonPort(): number {
  return parseInt(
    process.env.MCP_PROXY_SINGLETON_PORT || String(DEFAULT_SINGLETON_PORT),
    10,
  );
}

function startAsPrimary(port: number): Promise<void> {
  console.error(
    `[singleton] PRIMARY mode (pid ${process.pid}, port ${port})`,
  );
  const server = McpProxyServer.fromEnvironment();

  const originalCleanup = server.cleanup.bind(server);
  server.cleanup = async () => {
    try {
      await originalCleanup();
    } finally {
      releaseLock();
    }
  };

  server.setupGracefulShutdown();
  return server.start().then(() => {
    server.startHttpTransport(port);
  });
}

try {
  const port = getSingletonPort();
  const acquired = tryAcquireLock(port);

  if (acquired) {
    await startAsPrimary(port);
  } else {
    const lock = readLock();

    if (!lock) {
      console.error("[singleton] Lock exists but unreadable, cleaning up");
      cleanStaleLock();
      const retryAcquired = tryAcquireLock(port);
      if (retryAcquired) {
        await startAsPrimary(port);
      } else {
        console.error("[singleton] Could not acquire lock after cleanup, exiting");
        process.exit(1);
      }
    } else if (!isProcessAlive(lock.pid)) {
      console.error(
        `[singleton] Primary (pid ${lock.pid}) is dead, promoting to primary`,
      );
      cleanStaleLock();
      const retryAcquired = tryAcquireLock(port);
      if (retryAcquired) {
        await startAsPrimary(port);
      } else {
        console.error("[singleton] Race condition: another process took the lock");
        const newLock = readLock();
        if (newLock) {
          console.error(
            `[singleton] BRIDGE mode → primary at pid ${newLock.pid}, port ${newLock.port}`,
          );
          const bridge = new BridgeServer(newLock.port);
          bridge.setupGracefulShutdown();
          await bridge.start();
        } else {
          process.exit(1);
        }
      }
    } else {
      console.error(
        `[singleton] BRIDGE mode → primary at pid ${lock.pid}, port ${lock.port}`,
      );
      const bridge = new BridgeServer(lock.port);
      bridge.setupGracefulShutdown();
      await bridge.start();
    }
  }
} catch (error) {
  console.error("Failed to start MCP Proxy Gateway:", error);
  if (error instanceof Error && error.stack) {
    console.error("Stack trace:", error.stack);
  }
  process.exit(1);
}

export { McpProxyServer } from "./server.js";
export { ToolRegistry } from "./registry.js";
export { McpConnectorManager } from "./connector.js";
export { HybridSearch } from "./search.js";
export { EmbeddingEngine } from "./embeddings.js";
export { OutputShaper } from "./output-shaper.js";
export { PaginationManager } from "./pagination.js";
export { AuditLogger } from "./logger.js";
export { Dashboard } from "./dashboard.js";
export { BridgeServer } from "./bridge.js";
export {
  tryAcquireLock,
  readLock,
  releaseLock,
  isProcessAlive,
  cleanStaleLock,
} from "./singleton.js";
export * from "./types.js";
