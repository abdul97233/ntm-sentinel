/**
 * Global test setup: a minimal in-memory `chrome` stub so modules that touch
 * extension APIs at import time can load. Individual tests override pieces
 * with vi.fn() as needed (see tests/helpers/chrome.ts).
 */
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { installChromeStub } from './helpers/chrome';

installChromeStub();

afterEach(() => {
  cleanup();
});
