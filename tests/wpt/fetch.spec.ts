import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { WPT_FETCH_TESTS as TESTS } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BUNDLE_PATH = path.resolve(__dirname, "../e2e/scripts/private-request.js");
const TEST_TIMEOUT_MS = 60_000;

const WebPlatformTestStatusCode = {
  PASS: 0,
  FAIL: 1,
  TIMEOUT: 2,
  NOTRUN: 3,
  PRECONDITION_FAILED: 4,
} as const;

type WebPlatformTestStatusCode = (typeof WebPlatformTestStatusCode)[keyof typeof WebPlatformTestStatusCode];
type WebPlatformTestStatus = {
  status: WebPlatformTestStatusCode;
  message: string | null;
  stack: string | null;
};

type WebPlatfomTest = WebPlatformTestStatus & {
  name: string;
};

type WptMessage =
  | { type: "start" }
  | { type: "test_state"; test: WebPlatfomTest }
  | { type: "result"; test: WebPlatfomTest }
  | { type: "complete"; tests: WebPlatfomTest[]; status: WebPlatformTestStatus };

function getLibrarySource(): string {
  if (!fs.existsSync(BUNDLE_PATH)) {
    throw new Error(`Library bundle not found at ${BUNDLE_PATH}. Run: pnpm run build:e2e`);
  }

  return fs.readFileSync(BUNDLE_PATH, "utf-8");
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

async function runWptTests(
  browser: Browser,
  testPath: string,
  fn?: (page: Page) => Promise<void>,
): Promise<{ tests: WebPlatfomTest[]; status: WebPlatformTestStatus }> {
  const context = await browser.newContext();
  const page = await context.newPage();

  const { promise, resolve } = Promise.withResolvers<{ tests: WebPlatfomTest[]; status: WebPlatformTestStatus }>();

  await page.exposeFunction("__wptPostMessage", (data: WptMessage) => {
    if (data.type === "complete") {
      resolve({ tests: data.tests, status: data.status });
    }
  });

  await page.addInitScript(() => {
    const postMessage = (window as unknown as { __wptPostMessage: (data: unknown) => void }).__wptPostMessage;

    Object.defineProperty(window, "opener", {
      value: {
        postMessage,
      },
      writable: false,
      configurable: false,
    });
  });

  await fn?.(page);
  const response = await page.goto(`https://wpt.live/fetch/${testPath}`, {
    timeout: 30000,
  });

  if (!response?.ok()) {
    throw new Error(`Failed to load test page: ${response?.status()}`);
  }

  return promise;
}

function getTagsFromPath(testPath: string): string[] {
  const parts = testPath.split("/");
  return parts.slice(0, -1).map((dir) => `@${dir}`);
}

test.describe("Web Platform Tests", () => {
  for (const t of TESTS) {
    const testPath = typeof t === "string" ? t : t.path;
    const fullUrl = `https://wpt.live/fetch/${testPath}`;
    const tags = getTagsFromPath(testPath);

    test(
      testPath.replace(/\.html$/, ""),
      {
        tag: tags,
        annotation: { type: "wpt", description: fullUrl },
      },
      async ({ browser }: { browser: Browser }) => {
        test.setTimeout(TEST_TIMEOUT_MS);
        test.slow(typeof t === "object" && t.slow);

        const originalResults = await test.step("Collect built-in fetch baseline results", async (step) => {
          const originalResults = await runWptTests(browser, testPath);
          expect(originalResults.tests.length).toBeGreaterThan(0);
          const originalResultsMap = new Map<string, number>();
          for (const result of originalResults.tests) {
            originalResultsMap.set(result.name, result.status);
          }
          step.attach("baseline-results.json", {
            body: JSON.stringify(originalResults, null, 2),
            contentType: "application/json",
          });
          return originalResultsMap;
        });

        const wrappedResults = await runWptTests(browser, testPath, async (page) => {
          await injectLibrary(page);
        });
        expect(wrappedResults.tests.length).toBe(originalResults.size);

        for (const result of wrappedResults.tests) {
          await test.step(result.name, async (step) => {
            step.attach(`result-${result.name.replace(/ /g, "-").replace(/[^a-zA-Z0-9-]/g, "")}.json`, {
              body: JSON.stringify(result, null, 2),
              contentType: "application/json",
            });
            if (result.status !== WebPlatformTestStatusCode.PASS) {
              const originalStatus = originalResults.get(result.name);
              step.skip(result.status === WebPlatformTestStatusCode.NOTRUN, "not run");
              step.skip(
                originalStatus === WebPlatformTestStatusCode.FAIL ||
                  originalStatus === WebPlatformTestStatusCode.TIMEOUT ||
                  originalStatus === WebPlatformTestStatusCode.NOTRUN,
                "failed baseline",
              );
              if (result.status !== originalStatus) {
                throw new Error(`'${result.name}' was ${originalStatus} but is ${result.status}`);
              }
            }
          });
        }
      },
    );
  }
});
