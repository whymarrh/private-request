import { strict as assert } from "node:assert";
import test from "node:test";
import fetch from "node-fetch";
import { assertType } from "#helpers/index";
import bytes from "#src/bytes";
import { fetchSegments } from "#src/impl";

const getRandomNumber = async (_: number, __: number) => 0;

test("fetches all segments for a 2M resource when range requests are allowed and CORS allows `Content-Range`", async () => {
  const res = await fetchSegments(fetch, "http://localhost:8000/2M.cors.dat", getRandomNumber);
  assertType(res.type === "usable", "response should be usable");
  const { value: segments } = res;

  assert.equal(segments.length, 3);
  assert.deepEqual(
    segments.map((s) => s.range),
    [
      {
        start: 0,
        end: bytes.kibiBytes(1) - 1,
        redundant: 0,
      },
      {
        start: bytes.kibiBytes(1),
        end: bytes.kibiBytes(1) + bytes.mebiBytes(1) - 1,
        redundant: 0,
      },
      {
        start: bytes.mebiBytes(1),
        end: bytes.mebiBytes(2) - 1,
        redundant: bytes.kibiBytes(1),
      },
    ],
  );
});

test("fetches all segments for a 32 byte resource when range requests are allowed and CORS allows `Content-Range`", async () => {
  const res = await fetchSegments(fetch, "http://localhost:8000/32.cors.dat", getRandomNumber);
  assertType(res.type === "usable", "response should be usable");
  const { value: segments } = res;

  assert.equal(segments.length, 1);
  assert.deepEqual(
    segments.map((s) => s.range),
    [
      {
        start: 0,
        end: 31,
        redundant: 0,
      },
    ],
  );
});
