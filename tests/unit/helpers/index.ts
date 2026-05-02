import { strict as assert } from "node:assert";
import crypto from "node:crypto";

export function allLowerCase(strings: string[] = []) {
  return strings.map((s) => s.toLowerCase());
}

export function assertType(condition: boolean, message?: string | Error): asserts condition {
  assert.equal(condition, true, message);
}

/**
 * Returns a SHA-256 digest of the given data
 *
 * @param data - the data to digest
 */
export const sha256 = async (data: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> => {
  const buf = crypto.createHash("sha256").update(data).digest();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

/**
 * Returns a SHA-384 digest of the given data
 *
 * @param data - the data to digest
 */
export const sha384 = async (data: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> => {
  const buf = crypto.createHash("sha384").update(data).digest();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

/**
 * Returns a SHA-512 digest of the given data
 *
 * @param data - the data to digest
 */
export const sha512 = async (data: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> => {
  const buf = crypto.createHash("sha512").update(data).digest();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};
