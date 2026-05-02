import { strict as assert } from "node:assert";
import test from "node:test";
import { fetchExposeHeaders } from "#helpers/mocks";
import Bytes from "#src/bytes";
import fetchPrivately from "#src/index";

test("fetches a resource that does NOT have any exposed headers", async () => {
  const f = fetchPrivately({ fetch: fetchExposeHeaders() });
  // The server is configured to not expose headers for this resource but node-fetch doesn't
  // enforce CORS. The fetch implementation used sets the headers to simulate the behaviour.
  const r = await f("http://localhost:8000/2M.cors.noexpose.dat");

  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Content-Length"), Bytes.mebiBytes(2).toString(10));
});
