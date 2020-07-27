import { strict as assert } from 'assert';
import baretest from 'baretest';
import fetch from 'node-fetch';
import Bytes from '../../src/bytes';
import { fetchInitialSegment } from '../../src/impl';
import { assertType, filename, run } from './helpers';
import { fetchExposeHeaders } from './helpers/mocks';

const test = baretest(filename(import.meta.url));

const getRandomNumber = async (_: number, __: number) => 42;

test('fetches an initial segment of the resource when range requests are allowed and CORS allows `Content-Range`', async () => {
  const r = await fetchInitialSegment(fetch, 'http://localhost:8000/1M.cors.dat', getRandomNumber);
  assertType(r.type === 'usable', 'response should be usable');
  const { value: res } = r;

  assert.equal(res.response.status, 206);
  assert.equal(res.range.end - res.range.start + 1, Bytes.kibiBytes(1) + 42);
  assert.equal(res.totalSize, Bytes.mebiBytes(1));
});

test('fetches the full resource when range requests are allowed but CORS masks `Content-Range`', async () => {
  const r = await fetchInitialSegment(fetchExposeHeaders(), 'http://localhost:8000/1M.dat', getRandomNumber);
  assertType(r.type === 'unusable', 'response should be unusable');
  const { value: res } = r;

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Length'), Bytes.mebiBytes(1).toString(10));
});

test('fetches the full resource when range requests are NOT allowed', async () => {
  const r = await fetchInitialSegment(fetch, 'http://localhost:8000/1M.cors.nobytes.dat', getRandomNumber);
  assertType(r.type === 'unusable', 'response should be unusable');
  const { value: res } = r;

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Length'), Bytes.mebiBytes(1).toString(10));
});

await run(test);
