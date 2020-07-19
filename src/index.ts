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
  size?: number;
  redundant?: number;
  response: Response;
}

function assert(condition: any, msg?: string): asserts condition {
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

export async function fetchInitialSegment(fetch: FetchImplementation, req: RequestInfo, rand: RandomNumberGenerator): Promise<RequestSegment> {
  const segmentLength = Bytes.kibiBytes(1) + rand(0, Bytes.kibiBytes(1));
  const response = await fetch(req, {
    headers: {
      'Range': `bytes=0-${segmentLength - 1}`,
    },
  });
  const size = getContentLength(response);

  return {
    size,
    response,
  };
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
  assert(segmentSize <= contentLength && segmentStart < contentLength);

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
  assert(startIndex < contentLength && segmentSize <= contentLength);

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

export default function (fetch: FetchImplementation): FetchImplementation {
  return async function fetchPrivately(input: RequestInfo, init?: RequestInit): Promise<Response> {
    return fetch(input, init);
  };
}

// Based on https://github.com/signalapp/Signal-iOS/blob/3.13.2.6/SignalServiceKit/src/Network/ProxiedContentDownloader.swift
// ✓ Start by requesting a small initial segment (https://github.com/signalapp/Signal-iOS/blob/3.13.2.6/SignalServiceKit/src/Network/ProxiedContentDownloader.swift#L664-L688)
// ✓ Pick Content-Length from the response (https://github.com/signalapp/Signal-iOS/blob/3.13.2.6/SignalServiceKit/src/Network/ProxiedContentDownloader.swift#L763-L769)
// ✓ Choose segment size N (https://github.com/signalapp/Signal-iOS/blob/3.13.2.6/SignalServiceKit/src/Network/ProxiedContentDownloader.swift#L188-L208)
// ✓ While there is data remaining, split into segments of size N (https://github.com/signalapp/Signal-iOS/blob/3.13.2.6/SignalServiceKit/src/Network/ProxiedContentDownloader.swift#L220-L250)
// 5 Download each segment (https://github.com/signalapp/Signal-iOS/blob/3.13.2.6/SignalServiceKit/src/Network/ProxiedContentDownloader.swift#L690-L714)
// 6 Once all the downloads are complete, merge them (https://github.com/signalapp/Signal-iOS/blob/3.13.2.6/SignalServiceKit/src/Network/ProxiedContentDownloader.swift#L558-L580)
