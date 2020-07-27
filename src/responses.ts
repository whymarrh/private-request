/**
 * Represents a range of bytes
 */
export interface RequestRange {
  start: number;
  end: number;
  redundant: number;
}

/**
 * Represents a range of bytes
 */
export interface ResponseRange extends RequestRange {}

/**
 * Represents a segment of a response
 */
export interface ResponseSegment {
  response: Response;
  range: ResponseRange;
}

/**
 * Represents an initial response segment
 *
 * The complete size of the resource is determined by the `Content-Range` header
 * in the initial response.
 */
export interface InitialResponseSegment extends ResponseSegment {
  totalSize: number;
}

/**
 * Represents an unusable value
 */
export interface Unusable<T> {
  type: 'unusable';
  value: T;
}

/**
 * Represents a usable value
 */
export interface Usable<T> {
  type: 'usable';
  value: T;
}

/**
 * Represents a usable `A` or an unusable `B`
 */
export type UsableOrUnusable<A, B> = Usable<A> | Unusable<B>;

/**
 * Represents a usable response segment or an unusable response
 */
export type PossibleResponseSegment<T extends ResponseSegment> = Unusable<Response> | Usable<T>;

/**
 * Represents a valid `Content-Range` header value for bytes
 *
 * Note that the complete size is optional as it might be unknown or difficult to determine
 * (see also: [RFC 7233 §4.2]{@link https://tools.ietf.org/html/rfc7233#section-4.2}).
 */
export interface ByteContentRange {
  first: number;
  last: number;
  completeSize?: number;
}
