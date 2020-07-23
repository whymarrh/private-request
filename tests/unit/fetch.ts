import { strict as assert } from 'assert';
import baretest from 'baretest';
import fetch from 'node-fetch';
import fetchPrivately from '../../src';
import Bytes from '../../src/bytes';
import { filename, run, setupGlobals } from './helpers';

const test = baretest(filename(import.meta.url));

setupGlobals(test);

test('does fetch headers for a resource that has an exposed `Accept-Ranges: bytes` header', async () => {
  const f = fetchPrivately({ fetch });
  const r = await f('http://localhost:8000/32.cors.dat', { method: 'HEAD' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Length'), '32');
  assert.equal(r.headers.get('Accept-Ranges'), 'bytes');
});

test('does fetch headers for a resource that does NOT have an exposed `Accept-Ranges: bytes` header', async () => {
  const f = fetchPrivately({ fetch });
  const r = await f('http://localhost:8000/32.cors.nobytes.dat', { method: 'HEAD' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Length'), '32');
  assert.equal(r.headers.get('Accept-Ranges'), null);
});

test('does fetch headers for a resource that does NOT have a `Accept-Ranges: bytes` header', async () => {
  const f = fetchPrivately({ fetch });
  const r = await f('http://localhost:8000/32.nobytes.dat', { method: 'HEAD' });
  assert.equal(r.status, 200);
  // Content-Length is on the CORS safe headers list
  assert.equal(r.headers.get('Content-Length'), '32');
  assert.equal(r.headers.get('Accept-Ranges'), null);
});

test('does fetch part of a resource using `Range` header', async () => {
  const f = fetchPrivately({ fetch });
  const r = await f('http://localhost:8000/32.cors.dat', {
    method: 'GET',
    headers: {
      'Range': 'bytes=0-15'
    },
  });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('Content-Length'), '16');
  assert.equal(r.headers.get('Content-Range'), 'bytes 0-15/32');
});

test('does fetch too much of a resource using `Range` header', async () => {
  const f = fetchPrivately({ fetch });
  const r = await f('http://localhost:8000/32.cors.dat', {
    method: 'GET',
    headers: {
      'Range': 'bytes=0-63'
    },
  });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('Content-Length'), '32');
  assert.equal(r.headers.get('Content-Range'), 'bytes 0-31/32');
});

test('does fetch a full 32 byte resource', async () => {
  const f = fetchPrivately({ fetch });
  const r = await f('http://localhost:8000/32.cors.dat');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Length'), '32');
  assert.equal((await r.arrayBuffer()).byteLength, 32);
});

test('does fetch a full 1M resource', async () => {
  const f = fetchPrivately({ fetch });
  const r = await f('http://localhost:8000/1M.cors.dat');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Length'), Bytes.mebiBytes(1).toString(10));
  assert.equal((await r.arrayBuffer()).byteLength, Bytes.mebiBytes(1));
});

test('does fetch a full 2M resource', async () => {
  const f = fetchPrivately({ fetch });
  const r = await f('http://localhost:8000/2M.cors.dat');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Length'), Bytes.mebiBytes(2).toString(10));
  assert.equal((await r.arrayBuffer()).byteLength, Bytes.mebiBytes(2));
});

await run(test);
