/**
 * Dashboard module — Ember flame wireframe renderer (SPEC-189).
 * Humble glue: a thin requestAnimationFrame loop that strokes the flame
 * wireframe with a warm amber glow (shadowBlur), a slow Y rotation, a candle
 * lean and a flicker breathing. It owns the rAF handle and its teardown, and
 * delegates EVERY decision (geometry, colour, line width, rotation, sway,
 * flicker, glow) to the pure emberAvatar.js module. Lifecycle-tested only
 * (browser-only drawing), mirroring setupWizardAvatarRenderer.
 *
 * Visual DNA: "Agentic OS" — dark warm near-black + amber.
 */

import {
  emberStateToVisual,
  buildFlameWireframe,
  projectFlameVertex,
  emberRadiusFactor,
  emberSwayOffset,
} from './emberAvatar.js';

/**
 * @param {CanvasRenderingContext2D} context
 * @param {string} colorToken
 * @returns {string}
 */
function resolveColor(context, colorToken) {
  const value = getComputedStyle(context.canvas).getPropertyValue(colorToken).trim();
  return value === '' ? '#F4A93D' : value;
}

/**
 * The structural slice of a canvas the renderer depends on. A real
 * HTMLCanvasElement satisfies it; tests pass a lightweight fake without casts.
 *
 * @typedef {Object} EmberCanvas
 * @property {number} width
 * @property {number} height
 * @property {(contextId: '2d') => CanvasRenderingContext2D | null} getContext
 */

/**
 * Mounts the animated flame wireframe avatar on a 2D canvas and returns its
 * controls. The page calls setState() on each stream event and destroy() before
 * any teardown so the rAF loop never leaks.
 *
 * @param {Object} options
 * @param {EmberCanvas} options.canvas
 * @param {import('./emberAvatar.js').EmberState} [options.initialState]
 * @param {(callback: FrameRequestCallback) => number} [options.requestFrame]
 * @param {(handle: number) => void} [options.cancelFrame]
 * @param {() => number} [options.now]
 * @returns {{ setState: (state: import('./emberAvatar.js').EmberState) => void; destroy: () => void }}
 */
export function mountEmberAvatar(options) {
  const requestFrame = options.requestFrame ?? globalThis.requestAnimationFrame.bind(globalThis);
  const cancelFrame = options.cancelFrame ?? globalThis.cancelAnimationFrame.bind(globalThis);
  const now = options.now ?? (() => performance.now());
  const context = options.canvas.getContext('2d');
  const startTime = now();
  const flame = buildFlameWireframe({ rings: 7, meridians: 10 });

  let currentState = options.initialState ?? 'idle';
  /** @type {number | null} */
  let frameHandle = null;

  const projection = {
    tilt: 0.12,
    distance: 4,
    scale: Math.min(options.canvas.width, options.canvas.height) * 0.55,
    centerX: options.canvas.width / 2,
    centerY: options.canvas.height / 2,
  };

  /**
   * @param {number} time
   */
  function draw(time) {
    if (context === null) {
      return;
    }
    const elapsed = time - startTime;
    const visual = emberStateToVisual(currentState);
    const rotation = (elapsed * visual.rotationSpeed) / 1000;
    const sway = emberSwayOffset(visual, elapsed);
    const framedProjection = {
      ...projection,
      scale: projection.scale * emberRadiusFactor(visual, elapsed),
    };

    context.clearRect(0, 0, options.canvas.width, options.canvas.height);
    const color = resolveColor(context, visual.color);
    context.lineWidth = visual.lineWidth;
    context.lineCap = 'round';
    context.strokeStyle = color;
    context.shadowColor = color;
    context.shadowBlur = visual.glow;
    context.beginPath();
    for (const [from, to] of flame.edges) {
      const start = projectFlameVertex(flame.vertices[from], rotation, sway, framedProjection);
      const end = projectFlameVertex(flame.vertices[to], rotation, sway, framedProjection);
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
    }
    context.stroke();

    frameHandle = requestFrame(draw);
  }

  frameHandle = requestFrame(draw);

  return {
    setState: (state) => {
      currentState = state;
    },
    destroy: () => {
      if (frameHandle !== null) {
        cancelFrame(frameHandle);
        frameHandle = null;
      }
    },
  };
}
