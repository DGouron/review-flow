import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type {
  McpCompletionBridge,
  McpCompletionListener,
} from '@/modules/claude-invocation/entities/sessionCompletion/mcpCompletion.gateway.js';
import {
  sessionCompletionSchema,
  type SessionCompletion,
} from '@/modules/claude-invocation/entities/sessionCompletion/sessionCompletion.schema.js';

// Deferred to runtime so test files that mock `node:os` (which makes
// `homedir()` return undefined at import time) can still load this module
// without crashing their unrelated test suites.
function defaultDirectory(): string {
  return join(homedir(), '.claude-review', 'completions');
}

const DEFAULT_POLL_INTERVAL_MS = 1000;

export interface FileSystemMcpCompletionBridgeOptions {
  directory?: string;
  pollIntervalMs?: number;
  setIntervalImpl?: (handler: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearIntervalImpl?: (timer: ReturnType<typeof setInterval>) => void;
}

interface Subscription {
  timer: ReturnType<typeof setInterval>;
  listener: McpCompletionListener;
}

/**
 * Cross-process implementation of the MCP completion bridge. The MCP server
 * runs as a sub-process spawned by `claude --bg`, so an in-memory pub/sub
 * cannot reach the Fastify host. Instead, the publisher (MCP handler) writes
 * a small JSON file under ~/.claude-review/completions/<jobId>.json, and the
 * subscriber (Fastify, inside awaitSessionCompletion) polls that path until
 * it appears, then notifies its listener and removes the file.
 *
 * The 1s poll cadence is much faster than the 30s agents-json fallback so the
 * MCP signal remains "primary" in practice. If the host crashes between
 * publish and subscribe consumption, the file lingers; the next subscription
 * picks it up as a buffered event (same semantics as the in-memory variant).
 */
export class FileSystemMcpCompletionBridge implements McpCompletionBridge {
  private readonly directory: string;
  private readonly pollIntervalMs: number;
  private readonly setIntervalImpl: NonNullable<
    FileSystemMcpCompletionBridgeOptions['setIntervalImpl']
  >;
  private readonly clearIntervalImpl: NonNullable<
    FileSystemMcpCompletionBridgeOptions['clearIntervalImpl']
  >;
  private readonly subscriptions = new Map<string, Subscription>();

  constructor(options: FileSystemMcpCompletionBridgeOptions = {}) {
    this.directory = options.directory ?? defaultDirectory();
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.setIntervalImpl = options.setIntervalImpl ?? setInterval;
    this.clearIntervalImpl = options.clearIntervalImpl ?? clearInterval;
    ensureDirectory(this.directory);
  }

  publish(jobId: string, completion: SessionCompletion): void {
    ensureDirectory(this.directory);
    const path = this.fileFor(jobId);
    const tempPath = `${path}.tmp`;
    writeFileSync(tempPath, JSON.stringify(completion), 'utf-8');
    // Rename is atomic on POSIX, avoiding partial reads by a concurrent
    // subscriber polling the file.
    renameAtomic(tempPath, path);
  }

  subscribe(jobId: string, listener: McpCompletionListener): void {
    if (this.subscriptions.has(jobId)) {
      // Replace any previous subscription (last-writer-wins semantics, same
      // as the in-memory bridge).
      this.unsubscribe(jobId);
    }

    const tryConsume = (): boolean => {
      const path = this.fileFor(jobId);
      if (!existsSync(path)) return false;
      const parsed = readAndParse(path);
      if (parsed === null) {
        // Malformed file: remove it and report a failed completion so callers
        // do not wait forever on garbage.
        safeUnlink(path);
        listener({ source: 'mcp', outcome: 'failed', reason: 'completion-bridge-malformed' });
        return true;
      }
      safeUnlink(path);
      listener(parsed);
      return true;
    };

    if (tryConsume()) return;

    const timer = this.setIntervalImpl(() => {
      tryConsume();
    }, this.pollIntervalMs);

    this.subscriptions.set(jobId, { timer, listener });
  }

  unsubscribe(jobId: string): void {
    const subscription = this.subscriptions.get(jobId);
    if (subscription) {
      this.clearIntervalImpl(subscription.timer);
      this.subscriptions.delete(jobId);
    }
    // Always drop any buffered event so a future subscribe for the same
    // jobId does not pick a stale completion. Aligned with InMemoryMcp-
    // CompletionBridge's "no pending event after unsubscribe" semantics.
    safeUnlink(this.fileFor(jobId));
  }

  private fileFor(jobId: string): string {
    const safe = jobId.replace(/[^A-Za-z0-9._-]/g, '_');
    return join(this.directory, `${safe}.json`);
  }
}

function ensureDirectory(directoryPath: string): void {
  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: true });
  }
}

function renameAtomic(source: string, destination: string): void {
  // node:fs.renameSync is atomic on POSIX. The retry covers the rare case
  // where the destination directory has been removed between the write and
  // the rename (e.g. an external cleanup process). One retry is enough — if
  // it still fails the caller's enclosing try/catch surfaces the error.
  try {
    renameSync(source, destination);
  } catch {
    ensureDirectory(dirname(destination));
    renameSync(source, destination);
  }
}

function readAndParse(filePath: string): SessionCompletion | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const json: unknown = JSON.parse(raw);
    const result = sessionCompletionSchema.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function safeUnlink(filePath: string): void {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // Best-effort cleanup.
  }
}
