import Bytes from './bytes';
import type {
  IntegrityHashAlgo,
  DigestData,
  HashFunction,
  HashFunctionOptions,
  IntegrityHashFunctions,
} from './crypto';
import type {
  RequestRange,
  ResponseSegment,
  InitialResponseSegment,
  Unusable,
  UsableOrUnusable,
  PossibleResponseSegment,
  ByteContentRange,
} from './response-types';

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

function isDefined<T>(val: T): val is NonNullable<T> {
  return val !== undefined && val !== null;
}

function assert(condition: any, msg: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}

function assertIsNonNullable<T>(val: T): asserts val is NonNullable<T> {
  if (val === undefined || val === null) {
    throw new Error(`Expected value to be defined, but received '${val}'`);
  }
}

/**
 * Asserts that the given value is a non-empty string.
 * @param val - the value to check
 */
function assertIsNonEmptyString(val: any): asserts val is string {
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new TypeError(`Expected non-empty string, but received '${val}'`);
  }
}

export function parseByteContentRange(value: string): ByteContentRange | undefined {
  assertIsNonNullable(value);

  const regExp = /^bytes (\d+)-(\d+)\/((?:\d+)|(?:[*]))$/u;
  const [, ...parts] = value.match(regExp) ?? [];
  const [first, last, completeSize] = parts.map((n) => {
    const parsed = parseInt(n, 10);
    return Number.isFinite(parsed)
      ? parsed
      : undefined;
  });

  if (!isDefined(first) || !isDefined(last)) {
    return undefined;
  }

  // A Content-Range field value is invalid if it contains a
  // byte-range-resp that has a last-byte-pos value less than its
  // first-byte-pos value, or a complete-length value less than or equal
  // to its last-byte-pos value.
  // — https://tools.ietf.org/html/rfc7233#section-4.2
  if (last < first || (isDefined(completeSize) && completeSize <= last)) {
    return undefined;
  }

  return {
    first,
    last,
    completeSize,
  };
}

async function fetchUnusableResource(fetch: FetchImplementation, input: RequestInfo): Promise<Unusable<Response>> {
  const response = await fetch(input);
  return {
    type: 'unusable',
    value: response,
  };
}

async function fetchSegment(
  fetch: FetchImplementation,
  input: RequestInfo,
  segment: RequestRange,
): Promise<PossibleResponseSegment<ResponseSegment>>
{
  const response = await fetch(input, {
    headers: {
      'Range': `bytes=${segment.start}-${segment.end}`,
    },
  });

  if (response.status !== 206) {
    return {
      type: 'unusable',
      value: response,
    };
  }

  return {
    type: 'usable',
    value: {
      response,
      range: segment,
    },
  };
}

export async function fetchInitialSegment(
  fetch: FetchImplementation,
  input: RequestInfo,
  rand: RandomNumberGenerator,
): Promise<PossibleResponseSegment<InitialResponseSegment>>
{
  const segmentLength = Bytes.kibiBytes(1) + await rand(0, Bytes.kibiBytes(1));
  const s = await fetchSegment(fetch, input, {
    start: 0,
    end: segmentLength - 1,
    redundant: 0,
  });

  if (s.type === 'unusable') {
    return s;
  }

  const { value: { response } } = s;
  const contentRange = response.headers.get('Content-Range');

  if (!contentRange) {
    return fetchUnusableResource(fetch, input);
  }

  const byteContentRange = parseByteContentRange(contentRange);

  if (!isDefined(byteContentRange)) {
    return fetchUnusableResource(fetch, input);
  }

  const { first, last, completeSize } = byteContentRange;

  if (!isDefined(completeSize)) {
    return fetchUnusableResource(fetch, input);
  }

  return {
    type: 'usable',
    value: {
      response,
      totalSize: completeSize,
      range: {
        start: first,
        end: last,
        redundant: 0,
      },
    },
  };
}

/**
 * Returns the redundant/excess bytes for a request of size `segmentSize` starting at `segmentStart`.
 *
 * @param contentLength - the actual length of the resource
 * @param segmentSize - the size of the segments used to download the resource
 * @param segmentStart - the index of the current segment
 */
export function getRedundantByteCount(contentLength: number, segmentSize: number, segmentStart: number) {
  assertIsNonNullable(contentLength);
  assertIsNonNullable(segmentSize);
  assertIsNonNullable(segmentStart);
  assert(segmentSize <= contentLength, 'segmentSize must be less than or equal to contentLength');
  assert(segmentStart < contentLength, 'segmentStart must be less than contentLength');

  return Math.max(segmentSize - (contentLength - segmentStart), 0);
}

/**
 * Returns the appropriate segment size in bytes for the given content length.
 *
 * See [Expanding Signal GIF search]{@link https://signal.org/blog/signal-and-giphy-update/}
 *
 * Instead of making a request for the full resource we can pick a segment size of N
 * and issue requests for the resource in, N bytes at a time, overlapping when needed
 * to simulate padding a resource and make it more difficult for any network observer
 * to determine the original length of the resource.
 *
 * @param contentLength - the actual length of the resource
 */
export function getSegmentSize(contentLength: number): number {
  const availableSegmentSizes = [
    Bytes.mebiBytes(  1),
    Bytes.kibiBytes(500),
    Bytes.kibiBytes(100),
    Bytes.kibiBytes( 50),
    Bytes.kibiBytes( 10),
  ];

  for (const segmentSize of availableSegmentSizes) {
    if (contentLength >= segmentSize) {
      return segmentSize;
    }
  }

  return contentLength;
}

export function getSegmentRanges(contentLength: number, segmentSize: number, startIndex: number): RequestRange[] {
  assertIsNonNullable(contentLength);
  assertIsNonNullable(startIndex);
  assertIsNonNullable(segmentSize);
  assert(startIndex < contentLength, 'startIndex must be less than contentLength');
  assert(segmentSize <= contentLength, 'segmentSize must be less than or equal to contentLength');

  let ranges: RequestRange[] = [];
  let segmentStart = startIndex;
  while (segmentStart < contentLength) {
    const redundant = getRedundantByteCount(contentLength, segmentSize, segmentStart);
    const start = segmentStart - redundant;
    const end = start + segmentSize - 1;

    ranges.push({
      start,
      end,
      redundant,
    });

    segmentStart = end + 1;
  }

  return ranges;
}

export async function fetchSegments(
  fetch: FetchImplementation,
  input: RequestInfo,
  rand: RandomNumberGenerator,
): Promise<UsableOrUnusable<ResponseSegment[], Response>>
{
  const initialResponse = await fetchInitialSegment(fetch, input, rand);

  if (initialResponse.type === 'unusable') {
    return initialResponse;
  }

  const { value: { totalSize, range } } = initialResponse;

  if (range.end === (totalSize - 1)) {
    return {
      type: 'usable',
      value: [
        initialResponse.value,
      ],
    };
  }

  const segments: ResponseSegment[] = [initialResponse.value];
  for (const segmentRange of getSegmentRanges(totalSize, getSegmentSize(totalSize), range.end + 1)) {
    const segmentResponse = await fetchSegment(fetch, input, segmentRange);

    if (segmentResponse.type === 'unusable') {
      return segmentResponse;
    }

    const { value: { response, range } } = segmentResponse;
    segments.push({
      response,
      range,
    });
  }

  return {
    type: 'usable',
    value: segments,
  };
}

/**
 * Returns the algorithm and digest components of the given integrity string.
 *
 * See also: [Subresource Integrity - MDN]{@link https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity}
 *
 * See also: [Subresource Integrity]{@link https://w3c.github.io/webappsec-subresource-integrity/}
 *
 * @param integrity - the integrity string
 */
export function parseIntegrity(integrity: string): [IntegrityHashAlgo, string] | undefined {
  assertIsNonEmptyString(integrity);

  // base64-value      = 1*( ALPHA / DIGIT / "+" / "/" )*2( "=" )
  // hash-algo         = "sha256" / "sha384" / "sha512"
  // — https://www.w3.org/TR/CSP2/#source-list-syntax
  // hash-algo          = <hash-algo production from [Content Security Policy Level 2, section 4.2]>
  // base64-value       = <base64-value production from [Content Security Policy Level 2, section 4.2]>
  // hash-expression    = hash-algo "-" base64-value
  // — https://w3c.github.io/webappsec-subresource-integrity/#the-integrity-attribute
  const regExp = /^(sha(?:(?:256)|(?:384)|(?:512)))-([a-zA-Z0-9+/]+[=]{0,2})$/u;
  const [, algorithm, digest] = integrity.match(regExp) ?? [];

  if (!isDefined(algorithm) || !isDefined(digest)) {
    return undefined;
  }

  return [
    algorithm as IntegrityHashAlgo,
    digest,
  ];
}

/**
 * Returns a digest of the given data.
 *
 * The term digest refers to the base64 encoded result of executing a cryptographic
 * hash function on an arbitrary block of data, per
 * [Subresource Integrity §2]{@link https://w3c.github.io/webappsec-subresource-integrity/#terms}
 *
 * @param hash - the cryptographic hash function to apply
 * @param args - the args for the cryptographic hash function, including data
 */
export async function digest(hash: HashFunction, ...args: Parameters<HashFunction>): Promise<string> {
  const arrayBuffer = await hash(...args);
  const bytes = new Uint8Array(arrayBuffer);

  let s = '';
  for (const byte of bytes) {
    s += String.fromCharCode(byte);
  }

  return btoa(s);
}

export async function verifyIntegrity(data: Uint8Array, integrity: string | undefined, fns: IntegrityHashFunctions) {
  if (!integrity) {
    return;
  }

  const parsedIntegrity = parseIntegrity(integrity);

  if (!parsedIntegrity) {
    throw new TypeError('failed to fetch');
  }

  const [ algorithm, expectedDigest ] = parsedIntegrity;
  const actualDigest = await digest(fns[algorithm], data);
  if (actualDigest !== expectedDigest) {
    throw new TypeError('failed to fetch');
  }
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
