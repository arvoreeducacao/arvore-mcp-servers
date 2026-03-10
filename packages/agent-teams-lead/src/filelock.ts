import { mkdir, rmdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";

const STALE_LOCK_MS = 10_000;
const RETRY_INTERVAL_MS = 50;
const MAX_WAIT_MS = 5_000;

async function isLockStale(lockPath: string): Promise<boolean> {
  try {
    const info = await stat(lockPath);
    return Date.now() - info.mtimeMs > STALE_LOCK_MS;
  } catch {
    return true;
  }
}

async function acquireLock(lockPath: string): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    try {
      await mkdir(lockPath);
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        if (await isLockStale(lockPath)) {
          try {
            await rmdir(lockPath);
          } catch {
            // noop
          }
          continue;
        }
        await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS + Math.random() * 30));
        continue;
      }
      throw err;
    }
  }

  try {
    await rmdir(lockPath);
  } catch {
    // noop
  }
  await mkdir(lockPath);
}

async function releaseLock(lockPath: string): Promise<void> {
  try {
    await rmdir(lockPath);
  } catch {
    // noop
  }
}

export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockPath = `${filePath}.lock`;
  await acquireLock(lockPath);
  try {
    return await fn();
  } finally {
    await releaseLock(lockPath);
  }
}
