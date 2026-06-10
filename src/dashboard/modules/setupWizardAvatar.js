/**
 * Dashboard module — Setup Wizard wireframe avatar (SPEC-188, Phase 1).
 * Humble object: pure functions, no global state, no direct DOM access.
 * Holds ALL the avatar logic: maps the SPEC-183/187 wizard stream into one of
 * six avatar states, decides whether the avatar or the 2D fallback applies, and
 * projects the procedural wireframe geometry. The requestAnimationFrame canvas
 * loop lives in setupWizardAvatarRenderer.js and delegates every decision here.
 *
 * Visual DNA: "Agentic OS" — see project_agentic_os_design_dna.md.
 */

/**
 * @typedef {'idle' | 'working' | 'success' | 'error' | 'listening' | 'celebrating'} AvatarState
 */

/**
 * The six avatar states a wireframe core can be in, in narrative order.
 * @type {AvatarState[]}
 */
export const AVATAR_STATES = ['idle', 'working', 'success', 'error', 'listening', 'celebrating'];

/**
 * @param {unknown} value
 * @returns {string}
 */
function statusOf(value) {
  return value &&
    typeof value === 'object' &&
    typeof (/** @type {Record<string, unknown>} */ (value).status) === 'string'
    ? /** @type {string} */ (/** @type {Record<string, unknown>} */ (value).status)
    : '';
}

/**
 * Maps a single event status to the avatar state it drives. Returns null for a
 * status the avatar does not react to (so the fold can keep the previous state).
 *
 * @param {string} status
 * @returns {AvatarState | null}
 */
function avatarStateForStatus(status) {
  if (status === 'in_progress' || status === 'warning') {
    return 'working';
  }
  if (status === 'succeeded' || status === 'skipped') {
    return 'success';
  }
  if (status === 'blocked') {
    return 'error';
  }
  if (status === 'awaiting_input') {
    return 'listening';
  }
  if (status === 'completed') {
    return 'celebrating';
  }
  return null;
}

/**
 * Folds the ordered event list to the avatar state of the latest relevant event.
 * Nothing relevant yet → idle.
 *
 * @param {Array<Record<string, unknown>>} events
 * @returns {AvatarState}
 */
export function avatarStateFromEvents(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const state = avatarStateForStatus(statusOf(events[index]));
    if (state !== null) {
      return state;
    }
  }
  return 'idle';
}

/**
 * Decides whether the animated wireframe avatar applies. Phase 1 renders on a
 * plain 2D canvas (no WebGL), so the capability gate is "can we get a 2D
 * context"; reduced motion always routes to the static 2D fallback.
 *
 * @param {{ canvasSupported: boolean; reducedMotion: boolean }} capabilities
 * @returns {boolean}
 */
export function shouldUseAvatar(capabilities) {
  return capabilities.canvasSupported === true && capabilities.reducedMotion === false;
}

/**
 * @typedef {Object} AvatarVisual
 * @property {string} color CSS custom-property name driving the stroke colour.
 * @property {number} lineWidth Stroke width in device pixels.
 * @property {number} rotationSpeed Radians per second of the Y rotation.
 * @property {number} pulse Amplitude of the radius/opacity breathing envelope.
 */

/** @type {Record<AvatarState, AvatarVisual>} */
const AVATAR_VISUALS = {
  idle: { color: '--accent', lineWidth: 1, rotationSpeed: 0.3, pulse: 0.15 },
  working: { color: '--accent', lineWidth: 1.5, rotationSpeed: 1.2, pulse: 0.25 },
  success: { color: '--success', lineWidth: 1.5, rotationSpeed: 0.6, pulse: 0.4 },
  error: { color: '--danger', lineWidth: 2, rotationSpeed: 0.2, pulse: 0.5 },
  listening: { color: '--accent', lineWidth: 1.5, rotationSpeed: 0.45, pulse: 0.3 },
  celebrating: { color: '--success', lineWidth: 2, rotationSpeed: 1.6, pulse: 0.6 },
};

/**
 * Maps an avatar state to its stroke/animation parameters. Keeps the renderer
 * humble: every per-state visual decision lives here, not in the canvas loop.
 *
 * @param {AvatarState} state
 * @returns {AvatarVisual}
 */
export function avatarStateToVisual(state) {
  return AVATAR_VISUALS[state];
}

const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

/**
 * @typedef {[number, number, number]} Vertex
 */

/**
 * The 12 vertices of a unit icosahedron (golden-ratio rectangles). A fixed,
 * abstract wireframe core — the six avatar states reuse this same geometry and
 * differ only by colour/line-width/rotation-speed/pulse.
 * @type {Vertex[]}
 */
export const WIREFRAME_VERTICES = [
  [-1, GOLDEN_RATIO, 0],
  [1, GOLDEN_RATIO, 0],
  [-1, -GOLDEN_RATIO, 0],
  [1, -GOLDEN_RATIO, 0],
  [0, -1, GOLDEN_RATIO],
  [0, 1, GOLDEN_RATIO],
  [0, -1, -GOLDEN_RATIO],
  [0, 1, -GOLDEN_RATIO],
  [GOLDEN_RATIO, 0, -1],
  [GOLDEN_RATIO, 0, 1],
  [-GOLDEN_RATIO, 0, -1],
  [-GOLDEN_RATIO, 0, 1],
];

/**
 * The 30 edges of the icosahedron, as index pairs into WIREFRAME_VERTICES.
 * @type {Array<[number, number]>}
 */
export const WIREFRAME_EDGES = [
  [0, 11],
  [0, 5],
  [0, 1],
  [0, 7],
  [0, 10],
  [1, 5],
  [5, 11],
  [11, 10],
  [10, 7],
  [7, 1],
  [3, 9],
  [3, 4],
  [3, 2],
  [3, 6],
  [3, 8],
  [4, 9],
  [9, 8],
  [8, 6],
  [6, 2],
  [2, 4],
  [5, 9],
  [11, 4],
  [10, 2],
  [7, 6],
  [1, 8],
  [4, 5],
  [9, 1],
  [8, 7],
  [6, 10],
  [2, 11],
];

/**
 * @typedef {Object} Projection
 * @property {number} tilt Fixed X-axis tilt in radians.
 * @property {number} distance Camera distance for the perspective divide.
 * @property {number} scale Pixels per unit at the projection plane.
 * @property {number} centerX Canvas-space x offset.
 * @property {number} centerY Canvas-space y offset.
 */

/**
 * Projects a 3D vertex to a 2D canvas point: rotates around Y by
 * `rotationRadians`, applies the fixed X tilt, then a trivial perspective
 * divide and scale. Pure and deterministic.
 *
 * @param {Vertex} vertex
 * @param {number} rotationRadians
 * @param {Projection} projection
 * @returns {{ x: number; y: number }}
 */
export function projectVertex(vertex, rotationRadians, projection) {
  const [x, y, z] = vertex;

  const cosY = Math.cos(rotationRadians);
  const sinY = Math.sin(rotationRadians);
  const rotatedX = x * cosY + z * sinY;
  const rotatedZ = -x * sinY + z * cosY;

  const cosTilt = Math.cos(projection.tilt);
  const sinTilt = Math.sin(projection.tilt);
  const tiltedY = y * cosTilt - rotatedZ * sinTilt;
  const tiltedZ = y * sinTilt + rotatedZ * cosTilt;

  const perspective = projection.scale / (tiltedZ + projection.distance);
  return {
    x: projection.centerX + rotatedX * perspective,
    y: projection.centerY + tiltedY * perspective,
  };
}
