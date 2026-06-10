import type {
  EmberAnswerStartOptions,
  EmberAnswerStartResult,
  EmberAnswerSubscriber,
  EmberAnswerTransportGateway,
} from '@/modules/ember-chat/entities/emberAnswer/emberAnswerTransport.gateway.js';

type AnswerBuilder = (question: string, systemPrompt: string) => Promise<string>;

export class StubEmberAnswerTransportGateway implements EmberAnswerTransportGateway {
  startCount = 0;
  private shouldFailStart = false;
  private shouldFailMidStream = false;
  private answerBuilder: AnswerBuilder = async (question) => `Réponse à : ${question}`;

  failStart(): void {
    this.shouldFailStart = true;
  }

  failMidStream(): void {
    this.shouldFailMidStream = true;
  }

  respondWith(builder: AnswerBuilder): void {
    this.answerBuilder = builder;
  }

  /**
   * Makes the stub answer with the system prompt it was started with. The grounding
   * data lives in that prompt, so this proves the real path: readData → askEmber →
   * prompt → transport, rather than the stub fabricating an answer of its own.
   */
  answerFromSystemPrompt(): void {
    this.answerBuilder = async (_question, systemPrompt) => systemPrompt;
  }

  start(
    options: EmberAnswerStartOptions,
    subscriber: EmberAnswerSubscriber,
  ): EmberAnswerStartResult {
    if (this.shouldFailStart) {
      return { status: 'failed', reason: 'stub-start-failed' };
    }
    this.startCount += 1;
    void this.deliver(options, subscriber);
    return { status: 'started', run: { cancel: () => undefined } };
  }

  private async deliver(
    options: EmberAnswerStartOptions,
    subscriber: EmberAnswerSubscriber,
  ): Promise<void> {
    try {
      const answer = await this.answerBuilder(options.question, options.systemPrompt);
      const words = answer.split(' ');
      const emitted = this.shouldFailMidStream ? Math.ceil(words.length / 2) : words.length;
      for (let index = 0; index < emitted; index += 1) {
        const fragment = index === 0 ? words[index] : ` ${words[index]}`;
        subscriber.onChunk(fragment);
      }
      if (this.shouldFailMidStream) {
        subscriber.onError('stub-mid-stream-failed');
        return;
      }
      subscriber.onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'stub-answer-failed';
      subscriber.onError(message);
    }
  }
}
