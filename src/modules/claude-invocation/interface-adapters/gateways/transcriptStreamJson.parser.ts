export interface StreamJsonEvent {
  type?: string;
  subtype?: string;
  text?: string;
  delta?: { text?: string };
  message?: {
    content?: Array<{ type?: string; text?: string }> | string;
    stop_reason?: string | null;
  };
}

export function parseStreamJsonEvent(line: string): StreamJsonEvent | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (parsed !== null && typeof parsed === 'object') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function extractText(event: StreamJsonEvent): string | null {
  if (typeof event.text === 'string') {
    return event.text;
  }
  if (event.delta !== undefined && typeof event.delta.text === 'string') {
    return event.delta.text;
  }
  const content = event.message?.content;
  if (Array.isArray(content)) {
    const text = content
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text ?? '')
      .join('');
    return text.length > 0 ? text : null;
  }
  return null;
}

export function isTurnComplete(event: StreamJsonEvent): boolean {
  if (event.type === 'result' || event.type === 'message_stop') {
    return true;
  }
  if (event.type === 'system' && event.subtype === 'turn_duration') {
    return true;
  }
  return (
    event.type === 'assistant' &&
    event.message?.stop_reason === 'end_turn' &&
    extractText(event) !== null
  );
}
