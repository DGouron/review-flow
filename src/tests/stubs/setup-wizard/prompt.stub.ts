import type {
  PromptGateway,
  PromptChoice,
} from '@/modules/setup-wizard/entities/prompt/prompt.gateway.js';

export class StubPromptGateway implements PromptGateway {
  private readonly textAnswers: string[] = [];
  private readonly confirmAnswers: boolean[] = [];
  private readonly choiceAnswers: string[] = [];
  private readonly multiSelectAnswers: string[][] = [];

  queueText(value: string): void {
    this.textAnswers.push(value);
  }

  queueConfirm(value: boolean): void {
    this.confirmAnswers.push(value);
  }

  queueChoice(value: string): void {
    this.choiceAnswers.push(value);
  }

  queueMultiSelect(values: string[]): void {
    this.multiSelectAnswers.push(values);
  }

  async askText(_prompt: string, defaultValue?: string): Promise<string> {
    const next = this.textAnswers.shift();
    if (next !== undefined) return next;
    if (defaultValue !== undefined) return defaultValue;
    return '';
  }

  async askConfirm(_prompt: string, defaultValue?: boolean): Promise<boolean> {
    const next = this.confirmAnswers.shift();
    if (next !== undefined) return next;
    return defaultValue ?? false;
  }

  async askChoice(_prompt: string, choices: PromptChoice[]): Promise<string> {
    const next = this.choiceAnswers.shift();
    if (next !== undefined) return next;
    return choices[0]?.value ?? '';
  }

  async askMultiSelect(_prompt: string, choices: PromptChoice[]): Promise<string[]> {
    const next = this.multiSelectAnswers.shift();
    if (next !== undefined) return next;
    return choices.map((c) => c.value);
  }
}
