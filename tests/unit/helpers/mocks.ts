import fetch from 'node-fetch';
import { allLowerCase } from './index';

const CORS_FORBIDDEN_RESPONSE_HEADERS = allLowerCase([
  'set-cookie',
  'set-cookie2',
]);

const CORS_SAFELISTED_HEADERS = allLowerCase([
  'cache-control',
  'content-language',
  'content-length',
  'content-type',
  'expires',
  'last-modified',
  'pragma',
]);

/**
 * Returns a `fetch` implementation that exposes the given headers.
 *
 * See also: [CORS-safelisted response-header names]{@link https://fetch.spec.whatwg.org/#cors-safelisted-response-header-name}
 *
 * The list of given exposed headers is filtered for forbidden response headers
 * and merged with the default set of CORS safelisted headers.
 *
 * @param exposedHeaders - the set of headers to expose in addition to the safelisted headers
 */
export function fetchExposeHeaders(exposedHeaders: string[] = []) {
  const _exposedHeaders = allLowerCase(exposedHeaders).filter((e) => !CORS_FORBIDDEN_RESPONSE_HEADERS.includes(e));

  return async function (input: RequestInfo, init?: RequestInit): Promise<Response> {
    const res = await fetch(input, init);

    for (const header of res.headers.keys()) {
      if (CORS_SAFELISTED_HEADERS.includes(header) || _exposedHeaders.includes(header)) {
        continue;
      }

      res.headers.delete(header);
    }

    return res;
  }
}
