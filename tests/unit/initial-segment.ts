import { strict as assert } from 'assert';
import baretest from 'baretest';
import fetch from 'node-fetch';
import { fetchInitialSegment } from '../../src';
import Bytes from '../../src/bytes';
import { filename, run } from './helpers';

const test = baretest(filename(import.meta.url));

const getRandomNumber = async (_: number, __: number) => 42;

test('does fetch an initial segment of the resource when range requests are allowed and CORS allows `Content-Range`', async () => {
  const res = await fetchInitialSegment(fetch, 'http://localhost:8000/1M.cors.dat', getRandomNumber);
  assert.equal(res.response.status, 206);
  assert.equal(res.range.end - res.range.start + 1, Bytes.kibiBytes(1) + 42);
  assert.equal(res.totalSize, Bytes.mebiBytes(1));
});

test.skip('does fetch an initial segment of the resource when range requests are allowed but CORS masks `Content-Range`');

test('does fetch the full resource when range requests are NOT allowed and CORS allows `Content-Range`', async () => {
  const res = await fetchInitialSegment(fetch, 'http://localhost:8000/1M.cors.nobytes.dat', getRandomNumber);
  assert.equal(res.response.status, 200);
  assert.equal(res.totalSize, Bytes.mebiBytes(1));
  assert.equal(res.range.end - res.range.start + 1, Bytes.mebiBytes(1));
});

test('does fetch the full resource when range requests are NOT allowed and CORS masks `Content-Range`', async () => {
  const res = await fetchInitialSegment(fetch, 'http://localhost:8000/1M.nobytes.dat', getRandomNumber);
  assert.equal(res.response.status, 200);
  assert.equal(res.totalSize, Bytes.mebiBytes(1));
  assert.equal(res.range.end - res.range.start + 1, Bytes.mebiBytes(1));
});

await run(test);
