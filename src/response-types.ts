export interface RequestRange {
  start: number;
  end: number;
  redundant: number;
}

export interface ResponseRange extends RequestRange {}

export interface ResponseSegment {
  response: Response;
  range: ResponseRange;
}

export interface InitialResponseSegment extends ResponseSegment {
  totalSize: number;
}

export interface Unusable<T> {
  type: 'unusable';
  value: T;
}

export interface Usable<T> {
  type: 'usable';
  value: T;
}

export type UsableOrUnusable<A, B> = Usable<A> | Unusable<B>;

export type PossibleResponseSegment<T extends ResponseSegment> = Unusable<Response> | Usable<T>;
