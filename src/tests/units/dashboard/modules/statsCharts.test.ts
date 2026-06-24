import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  animateCounter,
  drawBugsByCategoryChart,
  drawReviewsPerMonthChart,
} from '@/dashboard/modules/statsCharts.js';

/**
 * animateCounter relies on requestAnimationFrame and performance.now which
 * aren't part of the Node runtime. Synchronous stubs drive the animation loop
 * to completion within a single tick: each call advances the fake clock past
 * the requested duration so progress reaches 1 immediately.
 */
type RafCallback = (timestamp: number) => void;

const globalRecord = globalThis as Record<string, unknown>;
let originalRaf: unknown;
let originalPerformance: unknown;
let fakeTime = 0;

beforeEach(() => {
  originalRaf = globalRecord.requestAnimationFrame;
  originalPerformance = globalRecord.performance;
  fakeTime = 0;
  globalRecord.requestAnimationFrame = (callback: RafCallback) => {
    fakeTime += 1000;
    callback(fakeTime);
    return 0;
  };
  globalRecord.performance = { now: () => fakeTime };
});

afterEach(() => {
  globalRecord.requestAnimationFrame = originalRaf;
  globalRecord.performance = originalPerformance;
});

describe('animateCounter', () => {
  it('eventually sets the textContent to the target value with the suffix', () => {
    const element = { textContent: '' };
    animateCounter(element as unknown as { textContent: string }, 100, 50, ' pts');
    expect(element.textContent).toBe('100 pts');
  });

  it('handles a zero target value', () => {
    const element = { textContent: 'placeholder' };
    animateCounter(element as unknown as { textContent: string }, 0, 50, '');
    expect(element.textContent).toBe('0');
  });

  it('short-circuits to the final value when prefers-reduced-motion matches', () => {
    const savedWindow = globalRecord.window;
    globalRecord.window = {
      matchMedia: (query: string) => ({ matches: query.includes('reduce') }),
    };
    const element = { textContent: '' };
    animateCounter(element as unknown as { textContent: string }, 42, 800, '/10');
    expect(element.textContent).toBe('42/10');
    globalRecord.window = savedWindow;
  });

  it('renders a negative target directly without counting down', () => {
    const element = { textContent: '' };
    animateCounter(element as unknown as { textContent: string }, -150, 800, '');
    expect(element.textContent).toBe('-150');
  });

  it('appends the suffix only on the final frame, not mid-animation', () => {
    const savedWindow = globalRecord.window;
    globalRecord.window = {
      matchMedia: (_query: string) => ({ matches: false }),
    };

    const frames: string[] = [];
    const element = {
      get textContent() {
        return frames[frames.length - 1] ?? '';
      },
      set textContent(value: string) {
        frames.push(value);
      },
    };

    animateCounter(element as unknown as { textContent: string }, 10, 50, '/10');

    const midFrames = frames.slice(0, -1);
    for (const frame of midFrames) {
      expect(frame).not.toContain('/10');
    }
    expect(frames[frames.length - 1]).toBe('10/10');

    globalRecord.window = savedWindow;
  });
});

interface RecordingContext {
  canvas: { width: number; height: number; style: Record<string, string> };
  filledTexts: string[];
  gradients: number;
  scale: () => void;
  beginPath: () => void;
  moveTo: () => void;
  lineTo: () => void;
  arc: () => void;
  arcTo: () => void;
  bezierCurveTo: () => void;
  setLineDash: () => void;
  roundRect: () => void;
  closePath: () => void;
  fill: () => void;
  stroke: () => void;
  fillText: (text: string) => void;
  createLinearGradient: () => { addColorStop: () => void };
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineJoin: string;
  lineCap: string;
  font: string;
  textAlign: string;
  textBaseline: string;
}

function recordingContext(): RecordingContext {
  const context: RecordingContext = {
    canvas: { width: 0, height: 0, style: {} },
    filledTexts: [],
    gradients: 0,
    scale: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    arcTo: () => {},
    bezierCurveTo: () => {},
    setLineDash: () => {},
    roundRect: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {},
    fillText: (text: string) => {
      context.filledTexts.push(text);
    },
    createLinearGradient: () => {
      context.gradients += 1;
      return { addColorStop: () => {} };
    },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineJoin: '',
    lineCap: '',
    font: '',
    textAlign: '',
    textBaseline: '',
  };
  return context;
}

const fullBugsByCategory = {
  isEmpty: false,
  emptyMessage: 'Aucune donnée de catégorie disponible',
  bars: [
    { categoryKey: 'logic', label: 'Logic', count: 5 },
    { categoryKey: 'security', label: 'Security', count: 3 },
    { categoryKey: 'style', label: 'Style', count: 1 },
    { categoryKey: 'performance', label: 'Performance', count: 0 },
    { categoryKey: 'typeSafety', label: 'Type Safety', count: 0 },
    { categoryKey: 'dependencies', label: 'Dependencies', count: 0 },
  ],
};

const emptyBugsByCategory = {
  isEmpty: true,
  emptyMessage: 'Aucune donnée de catégorie disponible',
  bars: [
    { categoryKey: 'security', label: 'Security', count: 0 },
    { categoryKey: 'logic', label: 'Logic', count: 0 },
    { categoryKey: 'performance', label: 'Performance', count: 0 },
    { categoryKey: 'typeSafety', label: 'Type Safety', count: 0 },
    { categoryKey: 'style', label: 'Style', count: 0 },
    { categoryKey: 'dependencies', label: 'Dependencies', count: 0 },
  ],
};

describe('drawBugsByCategoryChart', () => {
  const charts = globalThis as Record<string, unknown>;
  let savedDocument: unknown;
  let savedWindow: unknown;
  let context: RecordingContext;

  const installCanvas = (presentCanvasId: string): void => {
    context = recordingContext();
    const canvas = { getContext: () => context, parentElement: { clientWidth: 480 } };
    charts.document = {
      getElementById: (id: string) => (id === presentCanvasId ? canvas : null),
    };
    charts.window = { devicePixelRatio: 1 };
  };

  beforeEach(() => {
    savedDocument = charts.document;
    savedWindow = charts.window;
  });

  afterEach(() => {
    charts.document = savedDocument;
    charts.window = savedWindow;
  });

  it('renders the empty-state message when the view model is empty', () => {
    installCanvas('stats-bugs-category');

    drawBugsByCategoryChart('stats-bugs-category', emptyBugsByCategory);

    expect(context.filledTexts).toContain('Aucune donnée de catégorie disponible');
  });

  it('renders a gradient bar for each category when data is present', () => {
    installCanvas('stats-bugs-category');

    drawBugsByCategoryChart('stats-bugs-category', fullBugsByCategory);

    expect(context.gradients).toBe(6);
  });

  it('draws each category label below the axis', () => {
    installCanvas('stats-bugs-category');

    drawBugsByCategoryChart('stats-bugs-category', fullBugsByCategory);

    expect(context.filledTexts).toContain('Logic');
    expect(context.filledTexts).toContain('Security');
    expect(context.filledTexts).toContain('Dependencies');
  });

  it('does nothing when the canvas is absent', () => {
    installCanvas('other-id');

    expect(() => drawBugsByCategoryChart('stats-bugs-category', fullBugsByCategory)).not.toThrow();
  });
});

const trailingMonths = [
  { month: '2024-01', count: 2 },
  { month: '2024-02', count: 0 },
  { month: '2024-03', count: 1 },
  { month: '2024-04', count: 0 },
  { month: '2024-05', count: 3 },
  { month: '2024-06', count: 1 },
  { month: '2024-07', count: 0 },
  { month: '2024-08', count: 4 },
  { month: '2024-09', count: 2 },
  { month: '2024-10', count: 0 },
  { month: '2024-11', count: 1 },
  { month: '2024-12', count: 5 },
];

const emptyMonths = trailingMonths.map((point) => ({ month: point.month, count: 0 }));

describe('drawReviewsPerMonthChart', () => {
  const charts = globalThis as Record<string, unknown>;
  let savedDocument: unknown;
  let savedWindow: unknown;
  let context: RecordingContext;

  const installCanvas = (presentCanvasId: string): void => {
    context = recordingContext();
    const canvas = { getContext: () => context, parentElement: { clientWidth: 480 } };
    charts.document = {
      getElementById: (id: string) => (id === presentCanvasId ? canvas : null),
    };
    charts.window = { devicePixelRatio: 1 };
  };

  beforeEach(() => {
    savedDocument = charts.document;
    savedWindow = charts.window;
  });

  afterEach(() => {
    charts.document = savedDocument;
    charts.window = savedWindow;
  });

  it('renders the no-data message when every month is empty', () => {
    installCanvas('stats-reviews-per-month');

    drawReviewsPerMonthChart('stats-reviews-per-month', emptyMonths);

    expect(context.filledTexts).toContain('Not enough data');
  });

  it('draws the area gradient when at least one month has reviews', () => {
    installCanvas('stats-reviews-per-month');

    drawReviewsPerMonthChart('stats-reviews-per-month', trailingMonths);

    expect(context.gradients).toBeGreaterThan(0);
  });

  it('draws month labels below the axis', () => {
    installCanvas('stats-reviews-per-month');

    drawReviewsPerMonthChart('stats-reviews-per-month', trailingMonths);

    expect(context.filledTexts).toContain('01');
    expect(context.filledTexts).toContain('12');
  });

  it('does nothing when the canvas is absent', () => {
    installCanvas('other-id');

    expect(() => drawReviewsPerMonthChart('stats-reviews-per-month', trailingMonths)).not.toThrow();
  });
});
