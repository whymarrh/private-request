import { strict as assert } from 'assert';
import baretest from 'baretest';
import fetch from 'node-fetch';
import { fetchInitialSegment } from '../../src';
import { filename } from './helpers';

const test = baretest(filename(__filename));

const getRandomNumber = (_: number, __: number) => 42;

test('does fetch an initial segment of the resource when range requests are allowed', async () => {
  const res = await fetchInitialSegment(fetch, 'http://localhost:8000/1M.cors.dat', getRandomNumber);
  assert.equal(res.size, 1024 + 42);
});

test('does fetch the full resource when range requests are NOT allowed', async () => {
  const res = await fetchInitialSegment(fetch, 'http://localhost:8000/1M.cors.nobytes.dat', getRandomNumber);
  assert.equal(res.size, 1024 * 1024);
});

// Run all tests

(async () => await test.run())();
