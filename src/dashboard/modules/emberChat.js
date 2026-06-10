/**
 * Dashboard module — Ember read-only chat client (SPEC-189, Phase A).
 * Splits into pure decision functions (unit-tested) and a thin wiring function
 * `connectEmberStream` that binds them to injected browser globals (fetch,
 * document). The pure half holds all the logic — chunk fold for the progressively
 * streamed answer, avatar-state mapping, retry visibility, empty-input guard;
 * the wiring half is humble glue with no branching of its own and is not
 * unit-tested, mirroring the connectSetupWizardStream precedent.
 *
 * Transport: POST /api/ember/ask streaming a text/event-stream body back.
 * Read-only: the chat only asks questions and folds the streamed answer.
 *
 * Visual DNA: "Agentic OS" — see project_agentic_os_design_dna.md.
 */

/**
 * @typedef {{ type: string } & Record<string, unknown>} EmberEvent
 */

/**
 * @param {string} data
 * @returns {EmberEvent | null}
 */
export function parseEmberEvent(data) {
  try {
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Folds a streamed chunk into the accumulated answer. Non-chunk events leave the
 * answer untouched, so the caller can fold the whole stream blindly.
 *
 * @param {string} answer
 * @param {EmberEvent} event
 * @returns {string}
 */
export function foldAnswer(answer, event) {
  if (event.type === 'chunk' && typeof event.text === 'string') {
    return answer + event.text;
  }
  return answer;
}

/**
 * Maps a single stream event to the avatar state it drives. Returns null for an
 * event the avatar does not react to, so the caller keeps the previous state.
 *
 * @param {EmberEvent} event
 * @returns {'idle' | 'working' | 'error' | null}
 */
export function avatarStateFromEvent(event) {
  if (event.type === 'error') {
    return 'error';
  }
  if (event.type === 'status') {
    if (event.state === 'working') {
      return 'working';
    }
    if (event.state === 'idle') {
      return 'idle';
    }
  }
  return null;
}

/**
 * @param {EmberEvent[]} events
 * @returns {boolean}
 */
export function shouldShowRetry(events) {
  return events.some((event) => event.type === 'error');
}

/**
 * Empty-input rule (R: empty input → nothing sent, field stays focused).
 *
 * @param {string} question
 * @returns {boolean}
 */
export function shouldSendQuestion(question) {
  return question.trim().length > 0;
}

/**
 * Thin wiring: streams a question to POST /api/ember/ask, folds the SSE body,
 * drives the reused avatar and the aria-live region. Not unit-tested (humble
 * glue) — exercised in the browser only.
 *
 * @param {Object} options
 * @param {string} options.question
 * @param {(answer: string) => void} options.onAnswer
 * @param {(state: 'idle' | 'working' | 'error') => void} options.onAvatarState
 * @param {(text: string) => void} options.onAnnounce
 * @param {(visible: boolean) => void} options.onRetryVisible
 * @param {typeof fetch} [options.fetchImplementation]
 * @returns {Promise<void>}
 */
export async function connectEmberStream(options) {
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;

  if (!shouldSendQuestion(options.question)) {
    return;
  }

  const response = await fetchImplementation('/api/ember/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: options.question }),
  });

  const body = response.body;
  if (body === null) {
    options.onAvatarState('error');
    options.onAnnounce('// EMBER INDISPONIBLE — réessayer');
    options.onRetryVisible(true);
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  /** @type {EmberEvent[]} */
  const events = [];
  let answer = '';
  let buffer = '';

  const consumeLine = (line) => {
    if (!line.startsWith('data: ')) {
      return;
    }
    const event = parseEmberEvent(line.slice('data: '.length));
    if (event === null) {
      return;
    }
    events.push(event);
    answer = foldAnswer(answer, event);
    const avatarState = avatarStateFromEvent(event);
    if (avatarState !== null) {
      options.onAvatarState(avatarState);
    }
    if (event.type === 'chunk') {
      options.onAnswer(answer);
    }
    if (event.type === 'error') {
      options.onAnnounce(
        typeof event.message === 'string' ? event.message : '// EMBER INDISPONIBLE — réessayer',
      );
    }
    options.onRetryVisible(shouldShowRetry(events));
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      consumeLine(line);
    }
  }
  if (buffer.length > 0) {
    consumeLine(buffer);
  }

  if (answer.length > 0) {
    options.onAnnounce(answer);
  }
}
