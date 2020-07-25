import { strict as assert } from 'assert';
import baretest from 'baretest';
import fetch from 'node-fetch';
import { fetchSegments } from '../../src';
import Bytes from '../../src/bytes';
import { assertType, filename, run } from './helpers';

const test = baretest(filename(import.meta.url));

const getRandomNumber = async (_: number, __: number) => 0;

test('fetches all segments for a 2M resource when range requests are allowed and CORS allows `Content-Range`', async () => {
  const res = await fetchSegments(fetch, 'http://localhost:8000/2M.cors.dat', getRandomNumber);
  assertType(res.type === 'usable', 'response should be usable');
  const { value: segments } = res;

  assert.equal(segments.length, 3);
  assert.deepEqual(segments.map(s => s.range), [{
    start: 0,
    end: Bytes.kibiBytes(1) - 1,
    redundant: 0,
  }, {
    start: Bytes.kibiBytes(1),
    end: Bytes.kibiBytes(1) + Bytes.mebiBytes(1) - 1,
    redundant: 0,
  }, {
    start: Bytes.mebiBytes(1),
    end: Bytes.mebiBytes(2) - 1,
    redundant: Bytes.kibiBytes(1),
  }]);
});

test('fetches all segments for a 32 byte resource when range requests are allowed and CORS allows `Content-Range`', async () => {
  const res = await fetchSegments(fetch, 'http://localhost:8000/32.cors.dat', getRandomNumber);
  assertType(res.type === 'usable', 'response should be usable');
  const { value: segments } = res;

  assert.equal(segments.length, 1);
  assert.deepEqual(segments.map(s => s.range), [{
    start: 0,
    end: 31,
    redundant: 0,
  }]);
});

await run(test);
