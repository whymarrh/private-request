import { strict as assert } from 'assert';
import baretest from 'baretest';
import fetchPrivately from '../../src';
import Bytes from '../../src/bytes';
import { filename, run, setupGlobals } from './helpers';
import { fetchExposeHeaders } from './helpers/mocks';

const test = baretest(filename(import.meta.url));

setupGlobals(test);

test('does fetch a resource that does NOT have any exposed headers', async () => {
  const f = fetchPrivately({ fetch: fetchExposeHeaders() });
  // Nginx is configured to not expose headers for this resource but node-fetch doesn't
  // enforce CORS. The fetch implementation used sets the headers to simulate the behaviour.
  const r = await f('http://localhost:8000/2M.cors.noexpose.dat');

  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Length'), Bytes.mebiBytes(2).toString(10));
});

await run(test);
