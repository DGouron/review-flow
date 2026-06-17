import type { EnvironmentGateway } from '@/modules/claude-invocation/entities/billingState/environment.gateway.js';
import type {
  EmberAnswerSubscriber,
  EmberAnswerTransportGateway,
} from '@/modules/ember-chat/entities/emberAnswer/emberAnswerTransport.gateway.js';
import type { EmberMemoryGateway } from '@/modules/ember-chat/entities/emberMemory/emberMemory.gateway.js';
import type { EmberMemory } from '@/modules/ember-chat/entities/emberMemory/emberMemory.schema.js';
import type { EmberMessage } from '@/modules/ember-chat/entities/emberMessage/emberMessage.schema.js';
import type { EmberReadDataGateway } from '@/modules/ember-chat/entities/emberTool/emberTool.gateway.js';
import { buildEmberSystemPrompt } from '@/modules/ember-chat/services/emberSystemPrompt.js';
import type { EmberStreamSubscriber } from '@/modules/ember-chat/usecases/askEmber/emberStream.js';

export type {
  EmberStatus,
  EmberStreamSubscriber,
} from '@/modules/ember-chat/usecases/askEmber/emberStream.js';

export interface AskEmberDependencies {
  transport: EmberAnswerTransportGateway;
  environment: EnvironmentGateway;
  readData: EmberReadDataGateway;
  memory: EmberMemoryGateway;
  projectPath: string;
}

export type AskEmberResult =
  | {
      status: 'streaming';
      subscribe: (subscriber: EmberStreamSubscriber) => void;
      cancel: () => void;
    }
  | { status: 'unavailable'; reason: string }
  | { status: 'billing-regression-prevented' };

class AnswerRelay implements EmberAnswerSubscriber {
  private target: EmberStreamSubscriber | null = null;
  private readonly bufferedChunks: string[] = [];
  private terminal: { kind: 'done' } | { kind: 'error'; message: string } | null = null;
  private answer = '';

  constructor(private readonly onAnswered: (answer: string) => void) {}

  attach(subscriber: EmberStreamSubscriber): void {
    this.target = subscriber;
    subscriber.onStatus('working');
    for (const chunk of this.bufferedChunks) {
      subscriber.onChunk(chunk);
    }
    this.bufferedChunks.length = 0;
    if (this.terminal !== null) {
      this.flushTerminal(this.terminal);
    }
  }

  onChunk(text: string): void {
    this.answer += text;
    if (this.target === null) {
      this.bufferedChunks.push(text);
      return;
    }
    this.target.onChunk(text);
  }

  onDone(): void {
    this.onAnswered(this.answer);
    const terminal = { kind: 'done' } as const;
    if (this.target === null) {
      this.terminal = terminal;
      return;
    }
    this.flushTerminal(terminal);
  }

  onError(message: string): void {
    const terminal = { kind: 'error', message } as const;
    if (this.target === null) {
      this.terminal = terminal;
      return;
    }
    this.flushTerminal(terminal);
  }

  private flushTerminal(terminal: { kind: 'done' } | { kind: 'error'; message: string }): void {
    if (this.target === null) {
      return;
    }
    if (terminal.kind === 'done') {
      this.target.onStatus('idle');
      this.target.onDone();
      return;
    }
    this.target.onStatus('error');
    this.target.onError(terminal.message);
  }
}

async function loadMemorySafely(
  memory: EmberMemoryGateway,
  projectPath: string,
): Promise<EmberMemory | null> {
  try {
    return await memory.load(projectPath);
  } catch {
    // A corrupted or unreadable memory must never block an answer.
    return null;
  }
}

async function rememberTurn(
  memory: EmberMemoryGateway,
  projectPath: string,
  question: string,
  answer: string,
): Promise<void> {
  if (answer.trim().length === 0) {
    return;
  }
  try {
    await memory.appendTurn(projectPath, { question, answer });
  } catch {
    // Best-effort: a memory write failure must never break answering.
  }
}

export async function askEmber(
  message: EmberMessage,
  dependencies: AskEmberDependencies,
): Promise<AskEmberResult> {
  if (dependencies.environment.hasAnthropicApiKey()) {
    return { status: 'billing-regression-prevented' };
  }

  const { readData, memory, projectPath, transport } = dependencies;
  const systemPrompt = buildEmberSystemPrompt(
    {
      reviewScores: await readData.reviewScores(projectPath),
      insights: await readData.insights(projectPath),
      jobHistory: await readData.jobHistory(projectPath),
      worktrees: await readData.worktrees(),
      memory: await loadMemorySafely(memory, projectPath),
    },
    projectPath,
  );

  const relay = new AnswerRelay((answer) => {
    void rememberTurn(memory, projectPath, message.question, answer);
  });
  const started = transport.start({ question: message.question, systemPrompt, projectPath }, relay);

  if (started.status === 'failed') {
    return { status: 'unavailable', reason: started.reason };
  }

  return {
    status: 'streaming',
    subscribe: (subscriber) => relay.attach(subscriber),
    cancel: () => started.run.cancel(),
  };
}
