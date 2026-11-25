/* Logo Bubbles — MIT License, copyright (c) 2026 Yoveno GmbH.
 * Usage: <script src="logo-bubbles.js" defer></script>
 *        <button data-bubbles="40,49;59,49">...logo...</button>
 * Points are percentages of the visible logo bounds, measured from top left.
 */
(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const states = new WeakMap();
  const random = (min, max) => min + Math.random() * (max - min);

  document.addEventListener('click', event => {
    const host = event.target instanceof Element
      ? event.target.closest('[data-bubbles]') : null;
    if (!host || host.matches(':disabled, [aria-disabled="true"]') || reducedMotion.matches) return;
    if (typeof Element.prototype.animate !== 'function') return;

    const points = host.dataset.bubbles.split(';').map(point => {
      const parts = point.split(',').map(value => value.trim());
      if (parts.length !== 2 || parts.some(value => value === '')) return null;
      const [x, y] = parts.map(Number);
      return [x, y].every(value => Number.isFinite(value) && value >= 0 && value <= 100)
        ? { x: x / 100, y: y / 100 } : null;
    }).filter(Boolean);
    if (!points.length) return;

    // A custom selector can select another graphic; no SVG internals are read.
    let graphic;
    try {
      graphic = host.querySelector(host.dataset.bubblesTarget || 'svg, img, canvas') || host;
    } catch {
      return;
    }
    const bounds = graphic.getBoundingClientRect();
    const hostBounds = host.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !host.offsetWidth || !host.offsetHeight) return;

    let state = states.get(host);
    if (!state) {
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      const layer = document.createElement('span');
      layer.setAttribute('aria-hidden', 'true');
      Object.assign(layer.style, {
        position: 'absolute', inset: '0', pointerEvents: 'none',
        overflow: 'visible', zIndex: '1'
      });
      host.append(layer);
      state = { layer };
      states.set(host, state);
    }

    // Convert viewport measurements to local CSS pixels, including CSS scale.
    const scaleX = hostBounds.width / host.offsetWidth;
    const scaleY = hostBounds.height / host.offsetHeight;
    const width = bounds.width / scaleX;
    const height = bounds.height / scaleY;
    const left = (bounds.left - hostBounds.left) / scaleX - host.clientLeft;
    const top = (bounds.top - hostBounds.top) / scaleY - host.clientTop;
    const unit = Math.min(width, height);
    const requested = Number(host.dataset.bubblesCount || 10);
    const count = Math.min(30, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 10));
    const available = Math.min(count, 60 - state.layer.childElementCount);

    for (let i = 0; i < available; i++) {
      const point = points[i % points.length];
      const dot = document.createElement('span');
      const size = unit * random(.03, .08);
      const drift = unit * random(-.325, .325);
      const rise = unit * random(1.05, 1.7);
      const wobble = unit * random(.08, .17) * (i % 2 ? 1 : -1);
      Object.assign(dot.style, {
        position: 'absolute', display: 'block', pointerEvents: 'none',
        left: `${left + width * point.x}px`, top: `${top + height * point.y}px`,
        width: `${size}px`, height: `${size}px`, borderRadius: '50%',
        background: 'var(--bubble-color, currentColor)', opacity: '0'
      });
      state.layer.append(dot);
      const frame = (x, y, scale, opacity, offset) => ({
        transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`,
        opacity, offset
      });
      const motion = dot.animate([
        frame(0, 0, .35, 0, 0),
        frame(wobble * .3, -rise * .12, .85, .9, .12),
        frame(drift * .3 + wobble, -rise * .4, 1, .9, .4),
        frame(drift * .7 - wobble * .5, -rise * .7, .85, .65, .7),
        frame(drift, -rise, .3, 0, 1)
      ], { duration: random(1050, 1450), delay: i * 35, easing: 'linear', fill: 'both' });
      motion.onfinish = () => { dot.remove(); motion.cancel(); };
      motion.oncancel = () => dot.remove();
    }
  });
})();
