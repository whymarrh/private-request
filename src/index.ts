import Bytes from './bytes';
import type {
  RequestRange,
  ResponseSegment,
  InitialResponseSegment,
  Unusable,
  UsableOrUnusable,
  PossibleResponseSegment,
  ByteContentRange,
} from './response-types';

interface RandomNumberGenerator {
  (min: number, max: number): Promise<number>;
}

interface FetchImplementation {
  (input: RequestInfo, init?: RequestInit): Promise<Response>;
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

export function parseByteContentRange(value: string): ByteContentRange | undefined {
  assertIsNonNullable(value);

  const regExp =/^bytes (\d+)-(\d+)\/((?:\d+)|(?:[*]))$/u;
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

  if (range.end == (totalSize - 1)) {
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

const nullRandomNumberGenerator: RandomNumberGenerator = async () => 0;

export default function (options: PrivateRequestOptions = {}): FetchImplementation {
  const {
    fetch = window?.fetch,
    rng = nullRandomNumberGenerator,
  } = options;
  return async function fetchPrivately(input: RequestInfo, init?: RequestInit): Promise<Response> {
    if (init && (init.method !== 'GET' || init.headers)) {
      return fetch(input, init);
    }

    const possibleSegments = await fetchSegments(fetch, input, rng);
    if (possibleSegments.type === 'unusable') {
      return possibleSegments.value;
    }

    const { value: segments } = possibleSegments;
    const initialSegment = segments[0] as ResponseSegment;
    const bytes = await mergeSegmentBodies(segments);
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
