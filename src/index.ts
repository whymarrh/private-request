import Bytes from './bytes';

interface RandomNumberGenerator {
  (min: number, max: number): number;
}

interface FetchImplementation {
  (input: RequestInfo, init?: RequestInit): Promise<Response>;
}

interface RequestRange {
  start: number;
  end: number;
  redundant: number;
}

interface RequestSegment {
  response: Response;
  range: RequestRange;
}

interface InitialRequestSegment extends RequestSegment{
  totalSize: number;
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

function getContentLength(response: Response): number | undefined {
  const header = response.headers.get('Content-Length');
  return header === null ? undefined : parseInt(header, 10);
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

export async function fetchInitialSegment(fetch: FetchImplementation, req: RequestInfo, rand: RandomNumberGenerator): Promise<InitialRequestSegment> {
  const segmentLength = Bytes.kibiBytes(1) + rand(0, Bytes.kibiBytes(1));
  const response = await fetch(req, {
    headers: {
      'Range': `bytes=0-${segmentLength - 1}`,
    },
  });
  switch (response.status) {
    case 200: {
      const size = getContentLength(response)!;
      return {
        totalSize: size,
        response,
        range: {
          start: 0,
          end: size - 1,
          redundant: 0,
        },
      };
    }
    case 206: {
      // In the event we can't see this header, we need to request the full resource
      const contentRange = response.headers.get('Content-Range');
      if (!contentRange) {
        throw new Error('CORS prevents access to `Content-Range`')
      }

      const { size, rangeStart, rangeEnd } = parseContentRangeHeaderValue(contentRange);

      return {
        totalSize: size,
        response,
        range: {
          start: rangeStart,
          end: rangeEnd,
          redundant: 0,
        },
      };
    }
  }

  throw new Error('Could not request initial segment');
}

/**
 * Returns the redundant/excess bytes for a request of size {@code segmentSize} starting at {@segmentStart}
 *
 * @param contentLength the actual length of the resource
 * @param segmentSize the size of the segments used to download the resource
 * @param segmentStart the index of the current segment
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
 * Returns the appropriate segment size in bytes for the given content length
 *
 * See [Expanding Signal GIF search]{@link https://signal.org/blog/signal-and-giphy-update/}
 *
 * Instead of making a request for the full resource we can pick a segment size of N
 * and issue requests for the resource in, N bytes at a time, overlapping when needed
 * to simulate padding a resource and make it more difficult for any network observer
 * to determine the original length of the resource.
 *
 * @param contentLength the actual length of the resource
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

export async function fetchSegments(fetch: FetchImplementation, req: RequestInfo, rand: RandomNumberGenerator): Promise<RequestSegment[]> {
  const { response, totalSize, range } = await fetchInitialSegment(fetch, req, rand);
  const segments: RequestSegment[] = [{ response, range, }];

  if (range.end == (totalSize - 1)) {
    return segments;
  }

  for (const segmentRange of getSegmentRanges(totalSize, getSegmentSize(totalSize), range.end + 1)) {
    const response = await fetch(req, {
      headers: {
        'Range': `bytes=${segmentRange.start}-${segmentRange.end}`,
      },
    });
    segments.push({
      response,
      range: segmentRange,
    });
  }

  return segments;
}

export default function (fetch: FetchImplementation): FetchImplementation {
  return async function fetchPrivately(input: RequestInfo, init?: RequestInit): Promise<Response> {
    if (init && (init.method !== 'GET' || init.headers)) {
      return fetch(input, init);
    }

    const segments = await fetchSegments(fetch, input, () => 0);
    const initialSegment = segments[0] as RequestSegment;
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
