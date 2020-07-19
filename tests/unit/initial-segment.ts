import { strict as assert } from 'assert';
import baretest from 'baretest';
import fetch from 'node-fetch';
import { fetchInitialSegment } from '../../src';
import Bytes from '../../src/bytes';
import { filename, run } from './helpers';

const test = baretest(filename(import.meta.url));

const getRandomNumber = (_: number, __: number) => 42;

test('does fetch an initial segment of the resource when range requests are allowed', async () => {
  const res = await fetchInitialSegment(fetch, 'http://localhost:8000/1M.cors.dat', getRandomNumber);
  assert.equal(res.size, Bytes.kibiBytes(1) + 42);
});

test('does fetch the full resource when range requests are NOT allowed', async () => {
  const res = await fetchInitialSegment(fetch, 'http://localhost:8000/1M.cors.nobytes.dat', getRandomNumber);
  assert.equal(res.size, Bytes.mebiBytes(1));
});

await run(test);
