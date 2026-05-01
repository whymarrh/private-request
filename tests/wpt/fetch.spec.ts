import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { WPT_FETCH_TESTS } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BUNDLE_PATH = path.resolve(__dirname, '../e2e/scripts/private-request.js');
const TEST_TIMEOUT_MS = 5000;

type WebPlatformTestStatus = {
  status: number;
  message: string | null;
  stack: string | null;
};

type WebPlatfomTest = WebPlatformTestStatus & {
  name: string;
};

type WptMessage =
  | { type: 'start' }
  | { type: 'test_state'; test: WebPlatfomTest }
  | { type: 'result'; test: WebPlatfomTest }
  | { type: 'complete'; tests: WebPlatfomTest[]; status: WebPlatformTestStatus };

function getLibrarySource(): string {
  if (!fs.existsSync(BUNDLE_PATH)) {
    throw new Error(`Library bundle not found at ${BUNDLE_PATH}. Run: yarn build:e2e`);
  }

  return fs.readFileSync(BUNDLE_PATH, 'utf-8');
}

async function injectLibrary(page: Page): Promise<void> {
  const librarySource = getLibrarySource();

  await page.addInitScript(`
    (function() {
      ${librarySource};

      const originalFetch = window.fetch.bind(window);
      const wrappedFetch = privateRequest.default({ fetch: originalFetch });
      // window.fetch = wrappedFetch;
      console.log('[private-request] fetch wrapped successfully');
    })();
  `);
}

async function runWptTests(page: Page, testPath: string): Promise<WebPlatfomTest[]> {
  let resolve: (results: WebPlatfomTest[]) => void;
  let reject: (reason: unknown) => void;
  const completed = new Promise<WebPlatfomTest[]>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  await page.exposeFunction('__wptPostMessage', (data: WptMessage) => {
    console.log(`[wpt] postMessage: ${JSON.stringify(data)}`);
    if (data.type === 'complete') {
      switch (data.status.status) {
        case 0:
          resolve(data.tests);
          break;
        case 1:
          reject(new Error(data.status.message || 'Test failed'));
          break;
        case 2:
          reject(new Error('Test harness timeout'));
          break;
        default:
          reject(new Error(`Unknown test status: ${data.status}`));
          break;
      }
    }
  });

  await page.addInitScript(() => {
    const postMessage = (window as unknown as { __wptPostMessage: (data: unknown) => void }).__wptPostMessage;

    Object.defineProperty(window, 'opener', {
      value: {
        postMessage,
      },
      writable: false,
      configurable: false,
    });
  });

  const response = await page.goto(`https://wpt.live/fetch/${testPath}`, {
    timeout: 30000,
  });

  if (!response?.ok()) {
    throw new Error(`Failed to load test page: ${response?.status()}`);
  }

  return completed
}

function getTagsFromPath(testPath: string): string[] {
  const parts = testPath.split('/');
  return parts.slice(0, -1).map((dir) => `@${dir}`);
}

test.describe('Web Platform Tests', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await injectLibrary(page);
  });

  for (const testPath of WPT_FETCH_TESTS) {
    const fullUrl = `https://wpt.live/fetch/${testPath}`;
    const tags = getTagsFromPath(testPath);

    test(testPath.replace(/\.html$/, ''), {
      tag: tags,
      annotation: { type: 'wpt', description: fullUrl },
    }, async ({ page }: { page: Page }) => {
      test.setTimeout(TEST_TIMEOUT_MS);
      const results = await runWptTests(page, testPath);
      expect(results.length).toBeGreaterThan(0);
    });
  }
});
