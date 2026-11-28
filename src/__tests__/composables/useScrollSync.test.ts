import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  holdScrollRatio,
  proportionalTarget,
  scrollRatioOf,
  scrollTopFromRatio,
  useScrollSync,
} from '../../composables/useScrollSync';

describe('proportionalTarget', () => {
  it('maps the top of the source to the top of the destination', () => {
    expect(proportionalTarget(0, 1000, 200, 2000, 200)).toBe(0);
  });

  it('maps the bottom of the source to the bottom of the destination', () => {
    // srcMax = 800, dstMax = 1800, ratio = 1
    expect(proportionalTarget(800, 1000, 200, 2000, 200)).toBe(1800);
  });

  it('maps the middle of the source proportionally', () => {
    // srcMax = 800, srcTop 400 -> ratio 0.5, dstMax 1800 * 0.5 = 900
    expect(proportionalTarget(400, 1000, 200, 2000, 200)).toBe(900);
  });

  it('returns 0 when the source has no scroll range', () => {
    expect(proportionalTarget(0, 200, 200, 2000, 200)).toBe(0);
    expect(proportionalTarget(50, 100, 200, 2000, 200)).toBe(0);
  });

  it('returns 0 when the destination has no scroll range', () => {
    expect(proportionalTarget(400, 1000, 200, 200, 200)).toBe(0);
  });

  it('clamps a source position beyond its range', () => {
    expect(proportionalTarget(99999, 1000, 200, 2000, 200)).toBe(1800);
  });
});

describe('scrollTopFromRatio', () => {
  it('maps a 0.5 ratio to half the scrollable range', () => {
    expect(scrollTopFromRatio(0.5, 1000, 500)).toBe(250);
  });

  it('returns 0 when content fits the viewport (no scroll range)', () => {
    expect(scrollTopFromRatio(0.5, 500, 500)).toBe(0);
  });

  it('returns 0 for a zero ratio', () => {
    expect(scrollTopFromRatio(0, 1000, 200)).toBe(0);
  });

  it('clamps a ratio above 1 to the bottom of the range', () => {
    expect(scrollTopFromRatio(1.5, 1000, 200)).toBe(800);
  });

  it('clamps a negative ratio to 0', () => {
    expect(scrollTopFromRatio(-0.3, 1000, 200)).toBe(0);
  });

  it('handles content shorter than the viewport (negative max scroll)', () => {
    expect(scrollTopFromRatio(0.7, 100, 500)).toBe(0);
  });

  it('rounds to an integer scrollTop', () => {
    expect(scrollTopFromRatio(1 / 3, 1000, 100)).toBe(300);
  });
});

describe('scrollRatioOf', () => {
  const makeScrollable = (scrollTop: number, scrollHeight: number, clientHeight: number) => {
    const el = document.createElement('div');
    Object.defineProperties(el, {
      scrollTop: { value: scrollTop, writable: true },
      scrollHeight: { value: scrollHeight, configurable: true },
      clientHeight: { value: clientHeight, configurable: true },
    });
    return el;
  };

  it('returns 0 for null or non-scrollable elements', () => {
    expect(scrollRatioOf(null)).toBe(0);
    expect(scrollRatioOf(makeScrollable(0, 400, 400))).toBe(0);
    expect(scrollRatioOf(makeScrollable(50, 200, 400))).toBe(0);
  });

  it('computes the clamped scroll ratio in [0, 1]', () => {
    expect(scrollRatioOf(makeScrollable(400, 1000, 200))).toBe(0.5);
    expect(scrollRatioOf(makeScrollable(-20, 1000, 200))).toBe(0);
    expect(scrollRatioOf(makeScrollable(9999, 1000, 200))).toBe(1);
  });
});

describe('holdScrollRatio', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('re-applies ratio as container height grows and stops when user interacts', () => {
    let now = 0;
    let height = 1000;
    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    const el = document.createElement('div');
    document.body.appendChild(el);
    Object.defineProperties(el, {
      scrollTop: { value: 0, writable: true },
      scrollHeight: { get: () => height },
      clientHeight: { value: 200 },
    });

    const cancel = holdScrollRatio([() => el], 0.5, { quietMs: 250, maxMs: 2500 });
    expect(el.scrollTop).toBe(400);

    // Simulate async layout growth (e.g., images / Mermaid rendering)
    height = 2000;
    now = 16;
    rafQueue.shift()?.(now);
    expect(el.scrollTop).toBe(900);

    // User takes over with wheel: subsequent frames must not overwrite user scroll
    el.dispatchEvent(new Event('wheel'));
    el.scrollTop = 120;
    now = 32;
    rafQueue.shift()?.(now);
    expect(el.scrollTop).toBe(120);

    cancel();
  });

  it('stops automatically once layout stays quiet', () => {
    let now = 0;
    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });

    const el = document.createElement('div');
    document.body.appendChild(el);
    Object.defineProperties(el, {
      scrollTop: { value: 0, writable: true },
      scrollHeight: { value: 1000 },
      clientHeight: { value: 200 },
    });

    holdScrollRatio([() => el], 0.5, { quietMs: 100, maxMs: 1000 });
    expect(el.scrollTop).toBe(400);
    expect(rafQueue.length).toBe(1);

    now = 150;
    rafQueue.shift()?.(now);
    expect(rafQueue.length).toBe(0);
  });
});

describe('useScrollSync', () => {
  const defineScrollMetrics = (
    element: HTMLElement,
    scrollTop: number,
    scrollHeight: number,
    clientHeight: number,
  ) => {
    Object.defineProperties(element, {
      scrollTop: { value: scrollTop, writable: true },
      scrollHeight: { value: scrollHeight },
      clientHeight: { value: clientHeight },
    });
  };

  it('syncs the other pane when the owner scrolls', () => {
    const code = document.createElement('div');
    const preview = document.createElement('div');
    defineScrollMetrics(code, 400, 1000, 200);
    defineScrollMetrics(preview, 0, 2000, 200);

    const sync = useScrollSync();
    sync.attach(code, preview);
    code.dispatchEvent(new Event('wheel'));
    code.dispatchEvent(new Event('scroll'));

    expect(preview.scrollTop).toBe(900);
  });

  it('does not write back when the non-owner pane emits a scroll event', () => {
    const code = document.createElement('div');
    const preview = document.createElement('div');
    defineScrollMetrics(code, 400, 1000, 200);
    defineScrollMetrics(preview, 0, 2000, 200);

    const sync = useScrollSync();
    sync.attach(code, preview);
    code.dispatchEvent(new Event('wheel'));
    code.dispatchEvent(new Event('scroll'));
    code.scrollTop = 401;
    preview.dispatchEvent(new Event('scroll'));

    expect(code.scrollTop).toBe(401);
  });

  it('switches ownership when the user wheels the other pane', () => {
    const code = document.createElement('div');
    const preview = document.createElement('div');
    defineScrollMetrics(code, 400, 1000, 200);
    defineScrollMetrics(preview, 0, 2000, 200);

    const sync = useScrollSync();
    sync.attach(code, preview);
    code.dispatchEvent(new Event('wheel'));
    code.dispatchEvent(new Event('scroll'));
    preview.scrollTop = 450;
    preview.dispatchEvent(new Event('wheel'));
    preview.dispatchEvent(new Event('scroll'));

    expect(code.scrollTop).toBe(200);
  });

  it('skips destination writes within the 1px deadband', () => {
    const code = document.createElement('div');
    const preview = document.createElement('div');
    defineScrollMetrics(code, 400, 1000, 200);
    let previewTop = 900.5;
    const previewSetter = vi.fn((value: number) => { previewTop = value; });
    Object.defineProperties(preview, {
      scrollTop: {
        get: () => previewTop,
        set: previewSetter,
      },
      scrollHeight: { value: 2000 },
      clientHeight: { value: 200 },
    });

    const sync = useScrollSync();
    sync.attach(code, preview);
    code.dispatchEvent(new Event('scroll'));

    expect(previewSetter).not.toHaveBeenCalled();
    expect(preview.scrollTop).toBe(900.5);
  });

  it('adds and removes listeners for every handled event type', () => {
    const code = document.createElement('div');
    const preview = document.createElement('div');
    const codeAdd = vi.spyOn(code, 'addEventListener');
    const codeRemove = vi.spyOn(code, 'removeEventListener');
    const previewAdd = vi.spyOn(preview, 'addEventListener');
    const previewRemove = vi.spyOn(preview, 'removeEventListener');

    const sync = useScrollSync();
    sync.attach(code, preview);
    for (const eventType of ['scroll', 'wheel', 'touchstart', 'pointerdown']) {
      expect(codeAdd).toHaveBeenCalledWith(eventType, expect.any(Function), { passive: true });
      expect(previewAdd).toHaveBeenCalledWith(eventType, expect.any(Function), { passive: true });
    }

    sync.detach();
    for (const eventType of ['scroll', 'wheel', 'touchstart', 'pointerdown']) {
      expect(codeRemove).toHaveBeenCalledWith(eventType, expect.any(Function));
      expect(previewRemove).toHaveBeenCalledWith(eventType, expect.any(Function));
    }
  });
});
