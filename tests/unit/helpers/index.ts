import { strict as assert } from 'assert';
import crypto from 'crypto';
import path from 'path';
import type { Test } from 'baretest';
import fetch from 'node-fetch';

export function allLowerCase(strings: string[] = []) {
  return strings.map((s) => s.toLowerCase());
}

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

export function assertType(condition: boolean, message?: string | Error): asserts condition {
  assert.equal(condition, true, message);
}

/**
 * Represents data for a hash function
 */
export type DigestData = Parameters<typeof window.crypto.subtle.digest>[1];

/**
 * Returns a SHA-256 digest of the given data
 *
 * @param data - the data to digest
 */
export const sha256 = async (data: DigestData): Promise<ArrayBuffer> =>
  crypto.createHash('sha256').update(data as any).digest();

/**
 * Returns a SHA-384 digest of the given data
 *
 * @param data - the data to digest
 */
export const sha384 = async (data: DigestData): Promise<ArrayBuffer> =>
  crypto.createHash('sha384').update(data as any).digest();

/**
 * Returns a SHA-512 digest of the given data
 *
 * @param data - the data to digest
 */
export const sha512 = async (data: DigestData): Promise<ArrayBuffer> =>
  crypto.createHash('sha512').update(data as any).digest();
