import path from 'path';
import type { Test } from 'baretest';
import fetch from 'node-fetch';

export function filename(s: string) {
  const { name } = path.parse(s);
  return name;
}

export async function run(test: Test) {
  if (!await test.run()) {
    process.exit(1);
  }
}

export function setupGlobals(test: Test) {
  test.before(async () => {
    // @ts-ignore
    const { Headers, Response } = fetch;
    globalThis.Headers ??= Headers;
    globalThis.Response ??= Response;
  });
}
