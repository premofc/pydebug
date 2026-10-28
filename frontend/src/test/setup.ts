import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom polyfills for scroll and SSE
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.HTMLElement.prototype.scrollTo = function () {};

  class MockEventSource {
    url: string;
    onopen: any = null;
    onmessage: any = null;
    onerror: any = null;
    constructor(url: string) {
      this.url = url;
    }
    close() {}
  }
  (window as any).EventSource = MockEventSource;
}
