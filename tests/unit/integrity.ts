import { strict as assert } from 'assert';
import baretest from 'baretest';
import fetch from 'node-fetch';
import fetchPrivately, { digest, parseIntegrity } from '../../src';
import { filename, run, setupGlobals, sha256, sha384, sha512 } from './helpers';

const test = baretest(filename(import.meta.url));

setupGlobals(test);

test('throws on non-string and empty values', async () => {
  // @ts-ignore
  assert.throws(() => parseIntegrity(''));
  // @ts-ignore
  assert.throws(() => parseIntegrity(undefined));
  // @ts-ignore
  assert.throws(() => parseIntegrity(null));
  // @ts-ignore
  assert.throws(() => parseIntegrity(42));
  // @ts-ignore
  assert.throws(() => parseIntegrity({ foo: '42' }));
});

test('fails to parse an invalid integrity algorithm', async () => {
  const actual = parseIntegrity('sha1-3N12U9wJn+OKjhNoyEmCk5k4bDwPiUzqCkEd5lZ4zX4=');
  assert.deepEqual(actual, undefined);
});

test('fails to parse an invalid integrity string', async () => {
  const actual = parseIntegrity('sha384-!!!');
  assert.deepEqual(actual, undefined);
});

test('parses a valid integrity string using SHA-256', async () => {
  const actual = parseIntegrity('sha256-3N12U9wJn+OKjhNoyEmCk5k4bDwPiUzqCkEd5lZ4zX4=');
  const expected = ['sha256', '3N12U9wJn+OKjhNoyEmCk5k4bDwPiUzqCkEd5lZ4zX4='];
  assert.deepEqual(actual, expected);
});

test('parses a valid integrity string using SHA-384', async () => {
  const actual = parseIntegrity('sha384-1lIqF875X4vaDs00Z4Rme8tgjhbPVuXzRe07BdC6fC+6C91jeBc7VsKobTeRO5Of');
  const expected = ['sha384', '1lIqF875X4vaDs00Z4Rme8tgjhbPVuXzRe07BdC6fC+6C91jeBc7VsKobTeRO5Of'];
  assert.deepEqual(actual, expected);
});

test('parses a valid integrity string using SHA-512', async () => {
  const actual = parseIntegrity('sha384-2RJw+IML9cfH7bX7o03JVyPWS1rX3hrIIDkPu/ag2M8Nhvz/VIJWBOf3cAnrQddu3mdbgYbSPH2W5eoRO8Ii3A==');
  const expected = ['sha384', '2RJw+IML9cfH7bX7o03JVyPWS1rX3hrIIDkPu/ag2M8Nhvz/VIJWBOf3cAnrQddu3mdbgYbSPH2W5eoRO8Ii3A=='];
  assert.deepEqual(actual, expected);
});

test('digests words.dat', async () => {
  const r = await fetch('http://localhost:8000/words.cors.dat');
  const b = await r.arrayBuffer();
  const h = await digest(sha384, new Uint8Array(b));
  assert.equal(h, '1lIqF875X4vaDs00Z4Rme8tgjhbPVuXzRe07BdC6fC+6C91jeBc7VsKobTeRO5Of');
});

test('fails to fetch words.dat with an invalid integrity algorithm', async () => {
  const f = fetchPrivately({ fetch });
  const i = { integrity: 'sha42-1lIqF875X4vaDs00Z4Rme8tgjhbPVuXzRe07BdC6fC+6C91jeBc7VsKobTeRO5Of' };

  await assert.rejects(() => f('http://localhost:8000/words.dat', i), /TypeError/);
});

test('fails to fetch words.dat with an invalid integrity hash', async () => {
  const f = fetchPrivately({ fetch });
  const i = { integrity: 'sha384-1lIqF875X4vaDs00Z4Rme8tgjhbPVuXzRe07BdC6fC+6C91jeBc7Vs==========' };

  await assert.rejects(() => f('http://localhost:8000/words.dat', i), /TypeError/);
});

test('fails to fetch words.dat with the INCORRECT integrity hash', async () => {
  const f = fetchPrivately({ fetch, sha256, sha384, sha512 });
  const i = { integrity: 'sha384-1lIqF875X4vaDs00Z4Rme8tgjhbPVuXzRe07BdC6fC+6C91jeBc7VsAAAAAAAAAA' };

  await assert.rejects(() => f('http://localhost:8000/words.dat', i), /TypeError/);
});

test('fetches words.dat with the correct integrity hash', async () => {
  const f = fetchPrivately({ fetch, sha256, sha384, sha512 });
  const i = { integrity: 'sha384-1lIqF875X4vaDs00Z4Rme8tgjhbPVuXzRe07BdC6fC+6C91jeBc7VsKobTeRO5Of' };
  const r = await f('http://localhost:8000/words.dat', i);

  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Length'), '3539061');
});

await run(test);
