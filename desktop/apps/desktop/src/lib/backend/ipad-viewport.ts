/** iPad host layout only. Never remount Prism, blur its input, or change panel
 * state. WKWebView can pan the document to reveal a caret even with overflow
 * hidden; percentage-height panels then stay above a blank keyboard-sized gap.
 */
export function installIpadViewport(win: Window = window, doc: Document = document) {
  const html = doc.documentElement;
  const viewport = win.visualViewport;
  const previous = html.getAttribute('data-mps-ipad-viewport');
  html.setAttribute('data-mps-ipad-viewport', 'true');
  let frame = 0;
  let disposed = false;
  let timers: number[] = [];

  function update() {
    frame = 0;
    if (disposed) return;
    const zoomed = viewport && Math.abs(viewport.scale - 1) > 0.01;
    // The visual viewport already includes any native keyboard resize/inset.
    // Do not subtract a keyboard estimate or safe-area inset a second time.
    const measured = !zoomed && viewport ? viewport.height : win.innerHeight;
    const height = measured > 0 ? measured : html.clientHeight;
    const top = !zoomed && viewport ? Math.max(0, viewport.offsetTop) : 0;
    if (height > 0) html.style.setProperty('--mps-viewport-height', `${height}px`);
    html.style.setProperty('--mps-viewport-top', `${top}px`);
    // Reset the outer page only; chat/PDF/editor own their scroll containers.
    // Preserve deliberate pinch-zoom panning and the focused field/selection.
    if (!zoomed && (win.scrollX !== 0 || win.scrollY !== 0)) win.scrollTo(0, 0);
  }
  function schedule() {
    if (!disposed && !frame) frame = win.requestAnimationFrame(update);
  }
  function settle() {
    schedule();
    timers.forEach(id => win.clearTimeout(id));
    // WebKit may publish its final geometry after focusout/orientationchange.
    // Re-read it rather than restoring an orientation-specific cached height.
    timers = [80, 320, 700].map(delay => win.setTimeout(schedule, delay));
  }
  const listeners: [EventTarget, string, EventListener][] = [
    [win, 'resize', settle], [win, 'orientationchange', settle],
    [win, 'pageshow', settle], [win, 'scroll', schedule],
    [doc, 'focusin', settle], [doc, 'focusout', settle],
    [doc, 'visibilitychange', settle],
  ];
  if (viewport) listeners.push([viewport, 'resize', settle], [viewport, 'scroll', schedule]);
  for (const [target, event, handler] of listeners) target.addEventListener(event, handler);
  update();
  return () => {
    disposed = true;
    if (frame) win.cancelAnimationFrame(frame);
    timers.forEach(id => win.clearTimeout(id));
    for (const [target, event, handler] of listeners) target.removeEventListener(event, handler);
    html.style.removeProperty('--mps-viewport-height');
    html.style.removeProperty('--mps-viewport-top');
    if (previous === null) html.removeAttribute('data-mps-ipad-viewport');
    else html.setAttribute('data-mps-ipad-viewport', previous);
  };
}
