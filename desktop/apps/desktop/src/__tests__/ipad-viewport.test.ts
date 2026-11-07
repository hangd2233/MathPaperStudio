import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {installIpadViewport} from '../lib/backend/ipad-viewport';

class Viewport extends EventTarget {
  height = 1080;
  offsetTop = 0;
  scale = 1;
}
let viewport: Viewport;
let cleanup: (() => void) | undefined;
const height = () => document.documentElement.style.getPropertyValue('--mps-viewport-height');
const top = () => document.documentElement.style.getPropertyValue('--mps-viewport-top');
const flush = () => vi.advanceTimersByTime(20);
beforeEach(() => {
  vi.useFakeTimers();
  viewport = new Viewport();
  Object.defineProperty(window, 'visualViewport', {value:viewport, configurable:true});
  Object.defineProperty(window, 'innerHeight', {value:1080, configurable:true});
  Object.defineProperty(window, 'scrollY', {value:0, configurable:true});
  Object.defineProperty(window, 'scrollX', {value:0, configurable:true});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {cleanup?.();cleanup=undefined;vi.restoreAllMocks();vi.useRealTimers();});

describe('iPad keyboard viewport lifecycle', () => {
  it('follows repeated keyboard open/close without retaining the shorter height', () => {
    cleanup=installIpadViewport();
    for (let n=0;n<3;n++) {
      viewport.height=406;viewport.dispatchEvent(new Event('resize'));flush();expect(height()).toBe('406px');
      viewport.height=1080;viewport.dispatchEvent(new Event('resize'));flush();expect(height()).toBe('1080px');
    }
  });
  it('does not subtract the keyboard again when the native webview already resized', () => {
    Object.defineProperty(window, 'innerHeight', {value:406, configurable:true});
    viewport.height=406;cleanup=installIpadViewport();expect(height()).toBe('406px');
    // The visual viewport can recover before innerHeight has caught up.
    viewport.height=1080;viewport.dispatchEvent(new Event('resize'));flush();expect(height()).toBe('1080px');
  });
  it('corrects outer page displacement while leaving inner chat scroll and selection alone', () => {
    document.body.innerHTML='<div id="root"><textarea>unsent task guidance</textarea><div id="chat"></div></div>';
    const input=document.querySelector('textarea')!;input.focus();input.setSelectionRange(2,6);
    const chat=document.getElementById('chat')!;chat.scrollTop=180;
    Object.defineProperty(window,'scrollY',{value:674,configurable:true});
    viewport.height=406;viewport.offsetTop=674;cleanup=installIpadViewport();
    expect(window.scrollTo).toHaveBeenCalledWith(0,0);expect(top()).toBe('674px');
    expect(chat.scrollTop).toBe(180);expect(document.activeElement).toBe(input);expect(input.selectionStart).toBe(2);expect(input.value).toBe('unsent task guidance');
    viewport.height=1080;viewport.offsetTop=0;viewport.dispatchEvent(new Event('scroll'));flush();expect(height()).toBe('1080px');expect(top()).toBe('0px');
  });
  it('re-reads late focusout geometry even without a resize event', () => {
    viewport.height=406;cleanup=installIpadViewport();document.dispatchEvent(new Event('focusout'));flush();
    viewport.height=1080;viewport.offsetTop=0;vi.advanceTimersByTime(320);expect(height()).toBe('1080px');
  });
  it('uses current portrait geometry after rotation instead of a cached landscape size', () => {
    cleanup=installIpadViewport();viewport.height=1546;window.dispatchEvent(new Event('orientationchange'));flush();expect(height()).toBe('1546px');
    viewport.height=920;viewport.dispatchEvent(new Event('resize'));flush();expect(height()).toBe('920px');
    viewport.height=1546;document.dispatchEvent(new Event('focusout'));vi.advanceTimersByTime(720);expect(height()).toBe('1546px');
  });
  it('does not invent a bottom inset for floating/split or external keyboards', () => {
    cleanup=installIpadViewport();for(const event of ['focusin','focusout','focusin']) {document.dispatchEvent(new Event(event));vi.advanceTimersByTime(720);expect(height()).toBe('1080px');expect(top()).toBe('0px');}
  });
  it('preserves deliberate pinch-zoom panning', () => {
    viewport.scale=2;viewport.height=540;viewport.offsetTop=200;Object.defineProperty(window,'scrollY',{value:200,configurable:true});cleanup=installIpadViewport();expect(window.scrollTo).not.toHaveBeenCalled();expect(height()).toBe('1080px');
  });
  it('falls back without VisualViewport and removes pending listeners/timers on disposal', () => {
    Object.defineProperty(window,'visualViewport',{value:null,configurable:true});cleanup=installIpadViewport();expect(height()).toBe('1080px');document.dispatchEvent(new Event('focusout'));cleanup();cleanup=undefined;vi.advanceTimersByTime(1000);window.dispatchEvent(new Event('resize'));flush();expect(height()).toBe('');expect(document.documentElement.hasAttribute('data-mps-ipad-viewport')).toBe(false);
  });
});
