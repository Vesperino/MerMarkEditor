import type { Directive, DirectiveBinding } from 'vue';

const SHOW_DELAY_MS = 150;
const EDGE_MARGIN = 8;
const TOOLTIP_ID = 'app-tooltip-root';

interface TooltipState {
  el: HTMLElement;
  showTimer: number | null;
  current: HTMLElement | null;
}

let state: TooltipState | null = null;

function ensureTooltip(): TooltipState {
  if (state) return state;

  const el = document.createElement('div');
  el.id = TOOLTIP_ID;
  el.setAttribute('role', 'tooltip');
  el.style.cssText = [
    'position:fixed',
    'z-index:99999',
    'pointer-events:none',
    'background:var(--tooltip-bg, rgba(30,30,30,0.95))',
    'color:var(--tooltip-fg, #fff)',
    'font-size:12px',
    'line-height:1.4',
    'padding:5px 9px',
    'border-radius:6px',
    'max-width:280px',
    'white-space:normal',
    'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
    'opacity:0',
    'transform:translateY(2px)',
    'transition:opacity 90ms ease-out,transform 90ms ease-out',
    'visibility:hidden',
  ].join(';');

  document.body.appendChild(el);
  state = { el, showTimer: null, current: null };
  return state;
}

function place(tooltip: HTMLElement, target: HTMLElement): void {
  const rect = target.getBoundingClientRect();
  tooltip.style.visibility = 'hidden';
  tooltip.style.left = '0px';
  tooltip.style.top = '0px';
  const tipRect = tooltip.getBoundingClientRect();

  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  let top = rect.bottom + 6;

  if (top + tipRect.height > window.innerHeight - EDGE_MARGIN) {
    top = rect.top - tipRect.height - 6;
  }
  left = Math.max(EDGE_MARGIN, Math.min(left, window.innerWidth - tipRect.width - EDGE_MARGIN));

  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
  tooltip.style.visibility = 'visible';
}

function hide(): void {
  if (!state) return;
  if (state.showTimer !== null) {
    window.clearTimeout(state.showTimer);
    state.showTimer = null;
  }
  state.el.style.opacity = '0';
  state.el.style.transform = 'translateY(2px)';
  state.el.style.visibility = 'hidden';
  state.current = null;
}

function show(target: HTMLElement, text: string): void {
  const s = ensureTooltip();
  if (s.showTimer !== null) window.clearTimeout(s.showTimer);

  s.showTimer = window.setTimeout(() => {
    s.el.textContent = text;
    s.current = target;
    place(s.el, target);
    s.el.style.opacity = '1';
    s.el.style.transform = 'translateY(0)';
  }, SHOW_DELAY_MS);
}

function getText(binding: DirectiveBinding): string {
  const v = binding.value;
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function onEnter(this: HTMLElement, event: Event): void {
  const text = (this as HTMLElement).dataset.tooltipText || '';
  if (!text) return;
  void event;
  show(this, text);
}

function onLeave(): void {
  hide();
}

function attach(el: HTMLElement, text: string): void {
  el.dataset.tooltipText = text;
  if (el.dataset.tooltipBound === '1') return;
  el.dataset.tooltipBound = '1';
  el.addEventListener('mouseenter', onEnter);
  el.addEventListener('mouseleave', onLeave);
  el.addEventListener('focus', onEnter);
  el.addEventListener('blur', onLeave);
  el.addEventListener('click', onLeave);
}

function detach(el: HTMLElement): void {
  if (el.dataset.tooltipBound !== '1') return;
  delete el.dataset.tooltipBound;
  delete el.dataset.tooltipText;
  el.removeEventListener('mouseenter', onEnter);
  el.removeEventListener('mouseleave', onLeave);
  el.removeEventListener('focus', onEnter);
  el.removeEventListener('blur', onLeave);
  el.removeEventListener('click', onLeave);
  if (state?.current === el) hide();
}

export const vTooltip: Directive<HTMLElement, string | null | undefined> = {
  mounted(el, binding) {
    const text = getText(binding);
    if (text) attach(el, text);
  },
  updated(el, binding) {
    const text = getText(binding);
    if (text) {
      attach(el, text);
    } else {
      detach(el);
    }
  },
  beforeUnmount(el) {
    detach(el);
  },
};
