import { strict as assert } from "node:assert";
import test from "node:test";
import fetch from "node-fetch";
import { assertType } from "#helpers/index";
import { fetchExposeHeaders } from "#helpers/mocks";
import bytes from "#src/bytes";
import { fetchInitialSegment } from "#src/impl";

const getRandomNumber = async (_: number, __: number) => 42;

test("fetches an initial segment of the resource when range requests are allowed and CORS allows `Content-Range`", async () => {
  const r = await fetchInitialSegment(fetch, "http://localhost:8000/1M.cors.dat", getRandomNumber);
  assertType(r.type === "usable", "response should be usable");
  const { value: res } = r;

  assert.equal(res.response.status, 206);
  assert.equal(res.range.end - res.range.start + 1, bytes.kibiBytes(1) + 42);
  assert.equal(res.totalSize, bytes.mebiBytes(1));
});

test("fetches the full resource when range requests are allowed but CORS masks `Content-Range`", async () => {
  const r = await fetchInitialSegment(fetchExposeHeaders(), "http://localhost:8000/1M.dat", getRandomNumber);
  assertType(r.type === "unusable", "response should be unusable");
  const { value: res } = r;

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Length"), bytes.mebiBytes(1).toString(10));
});

test("fetches the full resource when range requests are NOT allowed", async () => {
  const r = await fetchInitialSegment(fetch, "http://localhost:8000/1M.cors.nobytes.dat", getRandomNumber);
  assertType(r.type === "unusable", "response should be unusable");
  const { value: res } = r;

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Length"), bytes.mebiBytes(1).toString(10));
});
