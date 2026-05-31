import { randomUUID } from 'node:crypto';
import type {
  SetupProcessGateway,
  SetupProcessHandle,
  SetupProcessSpawnOptions,
} from '@/modules/setup-wizard/entities/setupProcess/setupProcess.gateway.js';

export interface SetupRunSubscriber {
  onEvent: (line: string) => void;
  onClose: (code: number | null) => void;
}

export type StartSetupRunResult =
  | { status: 'started'; runId: string }
  | { status: 'already-active'; runId: string };

export type SubmitInputResult = { status: 'written' } | { status: 'no-active-run' };

export type CancelSetupRunResult = { status: 'cancelled' } | { status: 'no-active-run' };

interface ActiveRun {
  runId: string;
  handle: SetupProcessHandle;
  bufferedLines: string[];
  subscribers: Set<SetupRunSubscriber>;
  exitCode: number | null;
  exited: boolean;
  expiryTimer: ReturnType<typeof setTimeout> | null;
}

export interface SetupRunRegistryOptions {
  inactivityTimeoutMs?: number;
}

const DEFAULT_INACTIVITY_TIMEOUT_MS = 30_000;

export class SetupRunRegistry {
  private activeRun: ActiveRun | null = null;
  private readonly inactivityTimeoutMs: number;

  constructor(
    private readonly processGateway: SetupProcessGateway,
    options?: SetupRunRegistryOptions,
  ) {
    this.inactivityTimeoutMs = options?.inactivityTimeoutMs ?? DEFAULT_INACTIVITY_TIMEOUT_MS;
  }

  start(options: SetupProcessSpawnOptions): StartSetupRunResult {
    if (this.activeRun !== null && !this.activeRun.exited) {
      return { status: 'already-active', runId: this.activeRun.runId };
    }

    const handle = this.processGateway.spawn(options);
    const run: ActiveRun = {
      runId: randomUUID(),
      handle,
      bufferedLines: [],
      subscribers: new Set(),
      exitCode: null,
      exited: false,
      expiryTimer: null,
    };
    this.activeRun = run;

    handle.onLine((line) => {
      run.bufferedLines.push(line);
      for (const subscriber of run.subscribers) {
        subscriber.onEvent(line);
      }
    });

    handle.onExit((code) => {
      this.finalizeRun(run, code);
    });

    this.armExpiry(run);
    return { status: 'started', runId: run.runId };
  }

  subscribe(runId: string, subscriber: SetupRunSubscriber): () => void {
    const run = this.activeRun;
    if (run === null || run.runId !== runId) {
      return () => {};
    }

    for (const line of run.bufferedLines) {
      subscriber.onEvent(line);
    }

    if (run.exited) {
      subscriber.onClose(run.exitCode);
      return () => {};
    }

    run.subscribers.add(subscriber);
    this.clearExpiry(run);
    return () => {
      run.subscribers.delete(subscriber);
      if (run.subscribers.size === 0 && !run.exited) {
        this.armExpiry(run);
      }
    };
  }

  submitInput(runId: string, line: string): SubmitInputResult {
    const run = this.activeRun;
    if (run === null || run.runId !== runId || run.exited) {
      return { status: 'no-active-run' };
    }

    run.handle.writeLine(line);
    return { status: 'written' };
  }

  cancel(): CancelSetupRunResult {
    const run = this.activeRun;
    if (run === null || run.exited) {
      return { status: 'no-active-run' };
    }

    run.handle.kill();
    this.finalizeRun(run, null);
    return { status: 'cancelled' };
  }

  hasActiveRun(): boolean {
    return this.activeRun !== null && !this.activeRun.exited;
  }

  private finalizeRun(run: ActiveRun, code: number | null): void {
    if (run.exited) {
      return;
    }
    run.exited = true;
    run.exitCode = code;
    this.clearExpiry(run);
    for (const subscriber of run.subscribers) {
      subscriber.onClose(code);
    }
    run.subscribers.clear();
  }

  private armExpiry(run: ActiveRun): void {
    this.clearExpiry(run);
    const timer = setTimeout(() => {
      if (run.exited) {
        return;
      }
      run.handle.kill();
      this.finalizeRun(run, null);
    }, this.inactivityTimeoutMs);
    timer.unref?.();
    run.expiryTimer = timer;
  }

  private clearExpiry(run: ActiveRun): void {
    if (run.expiryTimer !== null) {
      clearTimeout(run.expiryTimer);
      run.expiryTimer = null;
    }
  }
}
