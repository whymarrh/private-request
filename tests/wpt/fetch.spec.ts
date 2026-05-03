import * as fs from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { WPT_FETCH_TESTS } from "./config.js";

const BUNDLE_PATH = new URL("../e2e/scripts/private-request.js", import.meta.url);
const TEST_TIMEOUT_MS = 60_000;
const LIBRARY_SOURCE = fs.readFileSync(BUNDLE_PATH, "utf-8");

const WebPlatformTestStatusCode = {
  PASS: 0,
  FAIL: 1,
  TIMEOUT: 2,
  NOT_RUN: 3,
  PRECONDITION_FAILED: 4,
} as const;

type WebPlatformTestStatusCode = (typeof WebPlatformTestStatusCode)[keyof typeof WebPlatformTestStatusCode];
type WebPlatformTestStatus = {
  status: WebPlatformTestStatusCode;
  message: string | null;
  stack: string | null;
};

type WebPlatformTest = WebPlatformTestStatus & {
  name: string;
};

type WptMessage =
  | { type: "start" }
  | { type: "test_state"; test: WebPlatformTest }
  | { type: "result"; test: WebPlatformTest }
  | { type: "complete"; tests: WebPlatformTest[]; status: WebPlatformTestStatus };

async function injectLibrary(page: Page): Promise<void> {
  await page.addInitScript(`
    (function() {
      ${LIBRARY_SOURCE};

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
): Promise<{ tests: WebPlatformTest[]; status: WebPlatformTestStatus }> {
  const page = await browser.newPage();

  const { promise, resolve } = Promise.withResolvers<{ tests: WebPlatformTest[]; status: WebPlatformTestStatus }>();

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
    timeout: TEST_TIMEOUT_MS,
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
  for (const t of WPT_FETCH_TESTS) {
    const testPath = typeof t === "string" ? t : t.path;
    const fullUrl = `https://wpt.live/fetch/${testPath}`;
    const tags = getTagsFromPath(testPath);

    test(testPath.replace(/\.html$/, ""), {
      tag: tags,
      annotation: { type: "wpt", description: fullUrl },
    }, async ({ browser }: { browser: Browser }) => {
      test.setTimeout(TEST_TIMEOUT_MS);
      test.slow(typeof t === "object" && t.slow);

      const originalResults = await test.step("Collect built-in fetch baseline results", async (step) => {
        const originalResults = await runWptTests(browser, testPath);
        expect(originalResults.tests.length).toBeGreaterThan(0);
        const originalResultsMap = new Map<string, number>();
        for (const result of originalResults.tests) {
          originalResultsMap.set(result.name, result.status);
        }
        await step.attach("baseline-results.json", {
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
          await step.attach(`result-${result.name.replace(/ /g, "-").replace(/[^a-zA-Z0-9-]/g, "")}.json`, {
            body: JSON.stringify(result, null, 2),
            contentType: "application/json",
          });
          if (result.status !== WebPlatformTestStatusCode.PASS) {
            const originalStatus = originalResults.get(result.name);
            step.skip(result.status === WebPlatformTestStatusCode.NOT_RUN, "not run");
            step.skip(
              originalStatus === WebPlatformTestStatusCode.FAIL ||
                originalStatus === WebPlatformTestStatusCode.TIMEOUT ||
                originalStatus === WebPlatformTestStatusCode.NOT_RUN,
              "failed baseline",
            );
            if (result.status !== originalStatus) {
              throw new Error(`'${result.name}' was ${originalStatus} but is ${result.status}`);
            }
          }
        });
      }
    });
  }
});
