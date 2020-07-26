import type { DigestData, HashFunctionOptions } from './crypto';
import type { ResponseSegment, InitialResponseSegment } from './response-types';

import { fetchSegments, verifyIntegrity } from './impl';

interface FetchImplementation {
  (input: RequestInfo, init?: RequestInit): Promise<Response>;
}

interface RandomNumberGenerator {
  (min: number, max: number): Promise<number>;
}

interface PrivateRequestOptions {
  fetch?: FetchImplementation;
  rng?: RandomNumberGenerator;
}

const nullRandomNumberGenerator: RandomNumberGenerator = async () => 0;

/**
 * Returns a SHA-256 digest of the given data
 *
 * @param data - the data to digest
 */
const sha256Browser = (data: DigestData) => window.crypto.subtle.digest('SHA-256', data);

/**
 * Returns a SHA-384 digest of the given data
 *
 * @param data - the data to digest
 */
const sha384Browser = (data: DigestData) => window.crypto.subtle.digest('SHA-384', data);

/**
 * Returns a SHA-512 digest of the given data
 *
 * @param data - the data to digest
 */
const sha512Browser = (data: DigestData) => window.crypto.subtle.digest('SHA-512', data);

export default function (options: PrivateRequestOptions & HashFunctionOptions = {}): FetchImplementation {
  const {
    fetch = window?.fetch,
    rng = nullRandomNumberGenerator,
    sha256 = sha256Browser,
    sha384 = sha384Browser,
    sha512 = sha512Browser,
  } = options;
  return async function fetchPrivately(input: RequestInfo, init?: RequestInit): Promise<Response> {
    if (init && (init.method !== undefined && init.method !== 'GET' || init.headers || (init.mode !== undefined && init.mode !== 'cors'))) {
      return fetch(input, init);
    }

    const possibleSegments = await fetchSegments(fetch, input, rng);
    if (possibleSegments.type === 'unusable') {
      return possibleSegments.value;
    }

    const { value: segments } = possibleSegments;
    const initialSegment = segments[0] as ResponseSegment;
    const bytes = await mergeSegmentBodies(segments);
    await verifyIntegrity(bytes, init?.integrity, { sha256, sha384, sha512 });
    return new Response(bytes, copyResponseInit(initialSegment.response, bytes));
  };
}

async function mergeSegmentBodies(segments: ResponseSegment[]) {
  const initialSegment = segments[0] as InitialResponseSegment;
  const bytes = new Uint8Array(initialSegment.totalSize);

  for (const segment of segments) {
    const redundantBytes = segment.range.redundant;
    const arrayBuffer = await segment.response.arrayBuffer();
    const segmentBytes = new Uint8Array(
      redundantBytes === 0
        ? arrayBuffer
        : arrayBuffer.slice(redundantBytes)
    );
    bytes.set(segmentBytes, segment.range.start + redundantBytes);
  }

  return bytes;
}

function copyResponseInit(init: ResponseInit, body: Uint8Array): ResponseInit {
  const headers = new Headers(init.headers);
  headers.set('Content-Length', body.byteLength.toString());

  return {
    status: 200,
    statusText: 'OK',
    headers,
  };
}
