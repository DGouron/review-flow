/**
 * Runtime settings that can be changed without restart
 */

export type ClaudeModel = 'sonnet' | 'opus';

interface RuntimeSettings {
  model: ClaudeModel;
}

const settings: RuntimeSettings = {
  model: 'opus', // Default to opus as requested
};

export function getModel(): ClaudeModel {
  return settings.model;
}

export function setModel(model: ClaudeModel): void {
  if (model !== 'sonnet' && model !== 'opus') {
    throw new Error(`Invalid model: ${model}`);
  }
  settings.model = model;
}

export function getSettings(): RuntimeSettings {
  return { ...settings };
}
