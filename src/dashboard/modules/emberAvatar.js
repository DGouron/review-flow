/**
 * Dashboard module — Ember flame wireframe avatar (SPEC-189).
 * Humble object: pure functions, no DOM, no global state. Holds the flame-shaped
 * wireframe geometry and every per-state visual decision, so the
 * requestAnimationFrame loop in emberAvatarRenderer.js carries no branching.
 *
 * Ember is a warm wireframe BRAISE, not the setup wizard's abstract icosahedron:
 * a teardrop flame mesh (pointed tip, rounded base) stroked in amber, that leans
 * and flickers like a live coal — livelier and warmer when spoken to.
 *
 * Visual DNA: "Agentic OS" — dark warm near-black + amber. See
 * project_agentic_os_design_dna.md.
 */

/**
 * @typedef {'idle' | 'working' | 'error'} EmberState
 */

/** @type {EmberState[]} */
export const EMBER_STATES = ['idle', 'working', 'error'];

/** Top of the flame (the tip) in model space. */
export const FLAME_TIP_Y = 1.5;
/** Bottom of the flame (the rounded base) in model space. */
export const FLAME_BASE_Y = -1.15;

/**
 * @typedef {Object} EmberVisual
 * @property {string} color CSS custom-property name driving the warm stroke.
 * @property {number} lineWidth Stroke width in device pixels.
 * @property {number} rotationSpeed Radians per second of the slow Y rotation.
 * @property {number} swaySpeed Radians per millisecond of the candle-lean sway.
 * @property {number} swayAmount Horizontal lean amplitude at the flame tip.
 * @property {number} flicker Amplitude of the scale shimmer (the coal breathing).
 * @property {number} glow Stroke shadow-blur in pixels (the warm halo around lines).
 */

/** @type {Record<EmberState, EmberVisual>} */
const EMBER_VISUALS = {
  idle: {
    color: '--accent',
    lineWidth: 1.5,
    rotationSpeed: 0.3,
    swaySpeed: 0.0011,
    swayAmount: 0.08,
    flicker: 0.025,
    glow: 10,
  },
  working: {
    color: '--accent',
    lineWidth: 1.8,
    rotationSpeed: 0.6,
    swaySpeed: 0.0026,
    swayAmount: 0.22,
    flicker: 0.16,
    glow: 16,
  },
  error: {
    color: '--danger',
    lineWidth: 2,
    rotationSpeed: 0.18,
    swaySpeed: 0.0018,
    swayAmount: 0.14,
    flicker: 0.22,
    glow: 12,
  },
};

/**
 * Maps an ember state to its stroke/animation parameters. Keeps the renderer
 * humble: every per-state decision lives here, not in the canvas loop.
 *
 * @param {EmberState} state
 * @returns {EmberVisual}
 */
export function emberStateToVisual(state) {
  return EMBER_VISUALS[state];
}

/**
 * @typedef {[number, number, number]} Vertex
 */

/**
 * The flame radius at a normalised height ringT ∈ [0,1] (0 near the tip, 1 at the
 * base). A teardrop profile: pointed at the top, bulging in the lower third, a
 * small rounded base — the silhouette that reads as a coal/flame rather than a
 * ball.
 *
 * @param {number} ringT
 * @returns {number}
 */
function flameRadius(ringT) {
  return Math.sin(Math.PI * ringT ** 1.3) * 0.9 + 0.06;
}

/**
 * Builds the flame wireframe as a surface of revolution: a single tip vertex
 * (index 0) plus `rings` × `meridians` body vertices, joined by tip spokes,
 * vertical meridian lines and horizontal ring loops. Pure and deterministic.
 *
 * @param {{ rings: number; meridians: number }} options
 * @returns {{ vertices: Vertex[]; edges: Array<[number, number]> }}
 */
export function buildFlameWireframe(options) {
  const { rings, meridians } = options;
  /** @type {Vertex[]} */
  const vertices = [[0, FLAME_TIP_Y, 0]];
  const indexAt = (ring, meridian) => 1 + ring * meridians + meridian;

  for (let ring = 0; ring < rings; ring += 1) {
    const ringT = (ring + 1) / rings;
    const y = FLAME_TIP_Y + (FLAME_BASE_Y - FLAME_TIP_Y) * ringT;
    const radius = flameRadius(ringT);
    for (let meridian = 0; meridian < meridians; meridian += 1) {
      const angle = (meridian / meridians) * Math.PI * 2;
      vertices.push([Math.cos(angle) * radius, y, Math.sin(angle) * radius]);
    }
  }

  /** @type {Array<[number, number]>} */
  const edges = [];
  for (let meridian = 0; meridian < meridians; meridian += 1) {
    edges.push([0, indexAt(0, meridian)]);
  }
  for (let ring = 0; ring < rings - 1; ring += 1) {
    for (let meridian = 0; meridian < meridians; meridian += 1) {
      edges.push([indexAt(ring, meridian), indexAt(ring + 1, meridian)]);
    }
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let meridian = 0; meridian < meridians; meridian += 1) {
      edges.push([indexAt(ring, meridian), indexAt(ring, (meridian + 1) % meridians)]);
    }
  }

  return { vertices, edges };
}

/**
 * @typedef {Object} Projection
 * @property {number} tilt Fixed X-axis tilt in radians.
 * @property {number} distance Camera distance for the perspective divide.
 * @property {number} scale Pixels per unit at the projection plane.
 * @property {number} centerX Canvas-space x offset.
 * @property {number} centerY Canvas-space y offset.
 */

/**
 * Projects a flame vertex to a 2D canvas point: rotates around Y, leans the
 * upper body sideways by `swayOffset` scaled by height (a candle flame bends at
 * the tip, not the base), applies the fixed tilt, then a perspective divide.
 * Pure and deterministic.
 *
 * @param {Vertex} vertex
 * @param {number} rotationRadians
 * @param {number} swayOffset
 * @param {Projection} projection
 * @returns {{ x: number; y: number }}
 */
export function projectFlameVertex(vertex, rotationRadians, swayOffset, projection) {
  const [x, y, z] = vertex;

  const cosY = Math.cos(rotationRadians);
  const sinY = Math.sin(rotationRadians);
  const rotatedX = x * cosY + z * sinY;
  const rotatedZ = -x * sinY + z * cosY;

  const heightFactor = (y - FLAME_BASE_Y) / (FLAME_TIP_Y - FLAME_BASE_Y);
  const leanedX = rotatedX + swayOffset * heightFactor;

  const cosTilt = Math.cos(projection.tilt);
  const sinTilt = Math.sin(projection.tilt);
  const tiltedY = y * cosTilt - rotatedZ * sinTilt;
  const tiltedZ = y * sinTilt + rotatedZ * cosTilt;

  const perspective = projection.scale / (tiltedZ + projection.distance);
  return {
    x: projection.centerX + leanedX * perspective,
    y: projection.centerY - tiltedY * perspective,
  };
}

/**
 * The breathing multiplier applied to the flame scale at a given time: a slow
 * pulse plus a faster two-tone shimmer that reads as flicker. Pure — 1 at time 0,
 * always within 1 ± flicker.
 *
 * @param {EmberVisual} visual
 * @param {number} time Milliseconds since the loop started.
 * @returns {number}
 */
const SHIMMER_SLOW_FREQUENCY = 0.013;
const SHIMMER_FAST_FREQUENCY = 0.031;
const SHIMMER_SLOW_WEIGHT = 0.6;
const SHIMMER_FAST_WEIGHT = 0.4;

export function emberRadiusFactor(visual, time) {
  const shimmer =
    visual.flicker *
    (SHIMMER_SLOW_WEIGHT * Math.sin(time * SHIMMER_SLOW_FREQUENCY) +
      SHIMMER_FAST_WEIGHT * Math.sin(time * SHIMMER_FAST_FREQUENCY));
  return 1 + shimmer;
}

/**
 * The horizontal lean of the flame tip at a given time. Pure — 0 at time 0,
 * always within ± swayAmount.
 *
 * @param {EmberVisual} visual
 * @param {number} time Milliseconds since the loop started.
 * @returns {number}
 */
export function emberSwayOffset(visual, time) {
  return visual.swayAmount * Math.sin(time * visual.swaySpeed);
}
