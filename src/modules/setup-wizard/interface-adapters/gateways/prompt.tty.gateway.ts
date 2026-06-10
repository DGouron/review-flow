import type {
  PromptGateway,
  PromptChoice,
} from '@/modules/setup-wizard/entities/prompt/prompt.gateway.js';

export class PromptTtyGateway implements PromptGateway {
  async askText(prompt: string, defaultValue?: string): Promise<string> {
    const { input } = await import('@inquirer/prompts');
    return input({ message: prompt, default: defaultValue });
  }

  async askConfirm(prompt: string, defaultValue?: boolean): Promise<boolean> {
    const { confirm } = await import('@inquirer/prompts');
    return confirm({ message: prompt, default: defaultValue ?? false });
  }

  async askChoice(prompt: string, choices: PromptChoice[]): Promise<string> {
    const { select } = await import('@inquirer/prompts');
    return select<string>({
      message: prompt,
      choices: choices.map((c) => ({ name: c.label, value: c.value })),
    });
  }

  async askMultiSelect(prompt: string, choices: PromptChoice[]): Promise<string[]> {
    const { checkbox } = await import('@inquirer/prompts');
    return checkbox<string>({
      message: prompt,
      choices: choices.map((c) => ({ name: c.label, value: c.value })),
    });
  }
}
