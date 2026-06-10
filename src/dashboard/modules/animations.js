/**
 * animations.js — Anime.js v4 animation helpers for the Operator's Console dashboard.
 *
 * Pure functions: take DOM elements + options, delegate to anime.js, return nothing
 * (or a stop handle for loops). No DOM access at module level, no global state.
 *
 * Every function guards on reducedMotion() and returns immediately (or applies end-state)
 * when the user prefers reduced motion.
 *
 * @module animations
 */

/**
 * Returns true when the user has opted-in to reduced motion.
 * @returns {boolean}
 */
export function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Fade-up stagger mount animation for a NodeList or Array of elements.
 * @param {Element[]|NodeList} elements
 * @param {{ staggerMs?: number, durationMs?: number, yOffset?: number, animeApi: object }} options
 */
export function animateMount(elements, options) {
  if (reducedMotion()) {
    for (const el of elements) {
      el.style.opacity = '1';
      el.style.transform = 'none';
    }
    return;
  }
  const { animeApi, staggerMs = 60, durationMs = 280, yOffset = 12 } = options;
  animeApi.animate(elements, {
    opacity: [{ from: 0, to: 1 }],
    translateY: [{ from: yOffset, to: 0 }],
    duration: durationMs,
    delay: animeApi.stagger(staggerMs),
    easing: 'easeOutCubic',
  });
}

/**
 * Animated number counter — morphs text content from oldValue to newValue.
 * Adds a brief scale pulse on the element.
 * @param {Element} element
 * @param {number} from
 * @param {number} to
 * @param {{ animeApi: object, durationMs?: number, onComplete?: () => void }} options
 */
export function animateCounter(element, from, to, options) {
  if (reducedMotion()) {
    element.textContent = String(to);
    return;
  }
  const { animeApi, durationMs = 360, onComplete } = options;
  const proxy = { value: from };
  animeApi.animate(proxy, {
    value: [{ from, to }],
    duration: durationMs,
    easing: 'easeOutCubic',
    onUpdate: () => {
      element.textContent = String(Math.round(proxy.value));
    },
    onComplete: () => {
      element.textContent = String(to);
      if (typeof onComplete === 'function') onComplete();
    },
  });
  animeApi.animate(element, {
    scale: [
      { from: 1, to: 1.06 },
      { from: 1.06, to: 1 },
    ],
    duration: durationMs,
    easing: 'easeOutBack',
  });
}

/**
 * Slide the shared tab underline element to match the target tab's
 * position and width. Pass the underline element and the active tab element.
 * @param {Element} underline
 * @param {Element} targetTab
 * @param {{ animeApi: object }} options
 */
export function slideTabUnderline(underline, targetTab, options) {
  const rect = targetTab.getBoundingClientRect();
  const parentRect = targetTab.parentElement.getBoundingClientRect();
  const left = rect.left - parentRect.left;
  const width = rect.width;

  if (reducedMotion()) {
    underline.style.transform = `translateX(${left}px)`;
    underline.style.width = `${width}px`;
    underline.style.opacity = '1';
    return;
  }
  const { animeApi } = options;
  animeApi.animate(underline, {
    translateX: [{ to: left }],
    width: [{ to: width }],
    opacity: [{ to: 1 }],
    duration: 350,
    easing: 'easeOutQuint',
  });
}

/**
 * Heartbeat — a 1px amber line traversing left-to-right infinitely
 * inside the given container element.
 * @param {Element} container - The 240px-wide container element.
 * @param {{ animeApi: object }} options
 * @returns {{ stop: () => void }}
 */
export function heartbeat(container, options) {
  if (reducedMotion()) {
    container.style.background =
      'linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%)';
    container.style.height = '1px';
    container.style.opacity = '0.4';
    return { stop: () => {} };
  }
  const { animeApi } = options;
  container.style.position = 'relative';
  container.style.height = '1px';
  container.style.overflow = 'hidden';

  const line = document.createElement('div');
  line.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 60%;
    height: 100%;
    background: linear-gradient(90deg, transparent 0%, var(--accent) 40%, var(--accent) 70%, transparent 100%);
    opacity: 0;
    transform: translateX(-100%);
  `;
  container.appendChild(line);

  const animation = animeApi.animate(line, {
    translateX: [{ from: '-100%', to: '200%' }],
    opacity: [
      { to: 0.8, duration: 300 },
      { to: 0.8, duration: 1800 },
      { to: 0, duration: 900 },
    ],
    duration: 3000,
    easing: 'linear',
    loop: true,
  });

  return {
    stop: () => {
      animation.pause();
      container.removeChild(line);
    },
  };
}

/**
 * Breathing amber glow pulse on a live/active review card.
 * @param {Element} element
 * @param {{ animeApi: object }} options
 * @returns {{ stop: () => void }}
 */
export function pulseLive(element, options) {
  if (reducedMotion()) return { stop: () => {} };
  const { animeApi } = options;
  const animation = animeApi.animate(element, {
    boxShadow: [
      {
        from: 'inset 0 0 0 0 rgba(244, 169, 61, 0)',
        to: 'inset 0 0 20px 4px rgba(244, 169, 61, 0.15)',
      },
      {
        from: 'inset 0 0 20px 4px rgba(244, 169, 61, 0.15)',
        to: 'inset 0 0 0 0 rgba(244, 169, 61, 0)',
      },
    ],
    duration: 2400,
    easing: 'easeInOutSine',
    loop: true,
  });
  return {
    stop: () => animation.pause(),
  };
}

/**
 * Spring-in entry for the settings modal (scale + opacity).
 * @param {Element} modal
 * @param {{ animeApi: object }} options
 */
export function springIn(modal, options) {
  if (reducedMotion()) {
    modal.style.opacity = '1';
    modal.style.transform = 'scale(1)';
    return;
  }
  const { animeApi } = options;
  animeApi.animate(modal, {
    scale: [{ from: 0.96, to: 1 }],
    opacity: [{ from: 0, to: 1 }],
    duration: 240,
    easing: 'easeOutBack',
  });
}

/**
 * Card lift on hover — translateY -2px + scale 1.005.
 * @param {Element} card
 * @param {{ animeApi: object }} options
 */
export function liftCard(card, options) {
  if (reducedMotion()) return;
  const { animeApi } = options;
  animeApi.animate(card, {
    translateY: [{ to: -2 }],
    scale: [{ to: 1.005 }],
    duration: 120,
    easing: 'easeOutCubic',
  });
}

/**
 * Return card to resting position.
 * @param {Element} card
 * @param {{ animeApi: object }} options
 */
export function unliftCard(card, options) {
  if (reducedMotion()) return;
  const { animeApi } = options;
  animeApi.animate(card, {
    translateY: [{ to: 0 }],
    scale: [{ to: 1 }],
    duration: 120,
    easing: 'easeOutCubic',
  });
}

/**
 * Subtle breathing pulse for the online status dot.
 * @param {Element} dot
 * @param {{ animeApi: object }} options
 * @returns {{ stop: () => void }}
 */
export function pulseStatusDot(dot, options) {
  if (reducedMotion()) return { stop: () => {} };
  const { animeApi } = options;
  const animation = animeApi.animate(dot, {
    opacity: [
      { from: 0.7, to: 1 },
      { from: 1, to: 0.7 },
    ],
    duration: 2000,
    easing: 'easeInOutSine',
    loop: true,
  });
  return { stop: () => animation.pause() };
}

/**
 * Very subtle logo breathing pulse (daemon-alive signal).
 * @param {Element} logo
 * @param {{ animeApi: object }} options
 * @returns {{ stop: () => void }}
 */
export function breatheLogo(logo, options) {
  if (reducedMotion()) return { stop: () => {} };
  const { animeApi } = options;
  const animation = animeApi.animate(logo, {
    scale: [
      { from: 1, to: 1.015 },
      { from: 1.015, to: 1 },
    ],
    duration: 6000,
    easing: 'easeInOutSine',
    loop: true,
  });
  return { stop: () => animation.pause() };
}

/**
 * Cross-fade between tab content panels (fade out old, fade in new).
 * @param {Element} outgoing - Element being hidden.
 * @param {Element} incoming - Element being shown.
 * @param {{ animeApi: object }} options
 */
export function crossFadeTab(outgoing, incoming, options) {
  if (reducedMotion()) {
    if (outgoing) outgoing.style.opacity = '1';
    if (incoming) incoming.style.opacity = '1';
    return;
  }
  const { animeApi } = options;
  if (outgoing) {
    animeApi.animate(outgoing, {
      opacity: [{ from: 1, to: 0 }],
      duration: 180,
      easing: 'easeOutCubic',
    });
  }
  if (incoming) {
    incoming.style.opacity = '0';
    animeApi.animate(incoming, {
      opacity: [{ from: 0, to: 1 }],
      duration: 180,
      easing: 'easeOutCubic',
    });
  }
}

/**
 * Expand an element from height 0 to its natural height using anime.js.
 * Uses a snapshot of the natural height before collapsing to 0.
 * @param {Element} element
 * @param {{ animeApi: object }} options
 */
export function expandHeight(element, options) {
  const { animeApi } = options;
  element.style.height = 'auto';
  const targetHeight = element.getBoundingClientRect().height;
  element.style.height = '0px';
  element.style.overflow = 'hidden';
  void element.offsetHeight;

  if (reducedMotion()) {
    element.style.height = 'auto';
    element.style.overflow = '';
    return;
  }

  animeApi.animate(element, {
    height: [{ from: 0, to: targetHeight }],
    opacity: [{ from: 0, to: 1 }],
    duration: 280,
    easing: 'easeOutCubic',
    onComplete: () => {
      element.style.height = 'auto';
      element.style.overflow = '';
    },
  });
}

/**
 * Collapse an element from its natural height to 0 using anime.js.
 * @param {Element} element
 * @param {{ animeApi: object }} options
 */
export function collapseHeight(element, options) {
  const { animeApi } = options;
  const currentHeight = element.getBoundingClientRect().height;
  element.style.height = `${currentHeight}px`;
  element.style.overflow = 'hidden';
  void element.offsetHeight;

  if (reducedMotion()) {
    element.style.height = '0px';
    return;
  }

  animeApi.animate(element, {
    height: [{ from: currentHeight, to: 0 }],
    opacity: [{ from: 1, to: 0 }],
    duration: 220,
    easing: 'easeOutCubic',
  });
}

/**
 * Toggle expand/collapse of an element and stagger-animate its children on open.
 * @param {Element} element
 * @param {boolean} isOpen - true to expand, false to collapse
 * @param {{ animeApi: object, childSelector?: string }} options
 */
export function toggleHeight(element, isOpen, options) {
  const { animeApi, childSelector = '.manage-row' } = options;
  if (isOpen) {
    expandHeight(element, { animeApi });
    if (!reducedMotion()) {
      const children = element.querySelectorAll(childSelector);
      if (children.length > 0) {
        animeApi.animate(children, {
          opacity: [{ from: 0, to: 1 }],
          translateY: [{ from: 8, to: 0 }],
          duration: 200,
          delay: animeApi.stagger(18),
          easing: 'easeOutCubic',
        });
      }
    }
  } else {
    collapseHeight(element, { animeApi });
  }
}

/**
 * Review status change: amber border fades → green glow pulse → green border.
 * @param {Element} element
 * @param {{ animeApi: object }} options
 */
export function reviewCompleted(element, options) {
  if (reducedMotion()) {
    element.style.borderColor = 'var(--success)';
    return;
  }
  const { animeApi } = options;
  const timeline = animeApi.createTimeline({ easing: 'easeOutCubic' });
  timeline
    .add(element, {
      boxShadow: [
        { from: '0 0 0 0 rgba(123, 196, 127, 0)', to: '0 0 16px 4px rgba(123, 196, 127, 0.4)' },
      ],
      duration: 300,
    })
    .add(element, {
      boxShadow: [
        { from: '0 0 16px 4px rgba(123, 196, 127, 0.4)', to: '0 0 0 0 rgba(123, 196, 127, 0)' },
      ],
      duration: 300,
    });
}
