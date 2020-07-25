import Bytes from './bytes';
import type {
  RequestRange,
  ResponseSegment,
  InitialResponseSegment,
  Unusable,
  UsableOrUnusable,
  PossibleResponseSegment,
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

export function parseContentRangeHeaderValue(value: string) {
  assertIsNonNullable(value);

  const regExp =/^bytes (\d+)-(\d+)\/(\d+)$/u;
  const [, ...parts] = value.match(regExp) ?? [];
  const [rangeStart, rangeEnd, size] = parts.map((n) => parseInt(n, 10));
  return {
    size,
    rangeStart,
    rangeEnd,
  };
}

async function fetchUnusableResource(fetch: FetchImplementation, req: RequestInfo): Promise<Unusable<Response>> {
  const response = await fetch(req);
  return {
    type: 'unusable',
    value: response,
  };
}

async function fetchSegment(fetch: FetchImplementation, req: RequestInfo, segment: RequestRange): Promise<PossibleResponseSegment<ResponseSegment>> {
  const response = await fetch(req, {
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
  req: RequestInfo,
  rand: RandomNumberGenerator,
): Promise<PossibleResponseSegment<InitialResponseSegment>>
{
  const segmentLength = Bytes.kibiBytes(1) + await rand(0, Bytes.kibiBytes(1));
  const s = await fetchSegment(fetch, req, {
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
    return fetchUnusableResource(fetch, req);
  }

  const { size, rangeStart, rangeEnd } = parseContentRangeHeaderValue(contentRange);

  return {
    type: 'usable',
    value: {
      response,
      totalSize: size,
      range: {
        start: rangeStart,
        end: rangeEnd,
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
  req: RequestInfo,
  rand: RandomNumberGenerator,
): Promise<UsableOrUnusable<ResponseSegment[], Response>>
{
  const initialResponse = await fetchInitialSegment(fetch, req, rand);

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
    const segmentResponse = await fetchSegment(fetch, req, segmentRange);

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
    let bytes: Uint8Array | undefined = undefined;
    for (const segment of segments) {
      const segmentBody = await segment.response.blob();
      const segmentBytes = segment.range.redundant == 0
        ? (await segmentBody.arrayBuffer())
        : (await segmentBody.arrayBuffer()).slice(segment.range.redundant);

      if (!bytes) {
        bytes = new Uint8Array(segmentBytes);
      } else {
        bytes = concatBytes(bytes, new Uint8Array(segmentBytes))
      }
    }

    assertIsNonNullable(bytes);
    return new Response(bytes, copyResponseInit(initialSegment.response, bytes));
  };
}

function copyResponseInit(init: Response, body: Uint8Array): ResponseInit {
  const headers = new Headers(init.headers);
  headers.set('Content-Length', body.byteLength.toString());

  return {
    status: 200,
    statusText: 'OK',
    headers,
  };
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const tmp = new Uint8Array(a.byteLength + b.byteLength);
  tmp.set(new Uint8Array(a));
  tmp.set(new Uint8Array(b), a.byteLength);
  return tmp;
}
