import { strict as assert } from 'assert';
import baretest from 'baretest';
import { parseByteContentRange } from '../../src/impl';
import { filename, run } from './helpers';

const test = baretest(filename(import.meta.url));

test('throws on non-string values', async () => {
  // @ts-ignore
  assert.throws(() => parseByteContentRange(null));
  // @ts-ignore
  assert.throws(() => parseByteContentRange(undefined));
  // @ts-ignore
  assert.throws(() => parseByteContentRange(42));
});

test('handles empty string value', async () => {
  const res = parseByteContentRange('');
  assert.deepEqual(res, undefined);
});

test('handles valid Content-Range header value `bytes 0-31/32`', async () => {
  const res = parseByteContentRange('bytes 0-31/32');
  assert.deepEqual(res, {
    completeSize: 32,
    first: 0,
    last: 31,
  });
});

test('handles valid Content-Range header value with unknown size `bytes 42-99/*`', async () => {
  const res = parseByteContentRange('bytes 42-99/*');
  assert.deepEqual(res, {
    completeSize: undefined,
    first: 42,
    last: 99,
  });
});

test('handles Content-Range header value with leading zeros `bytes 03-05/09`', async () => {
  const res = parseByteContentRange('bytes 03-05/09');
  assert.deepEqual(res, {
    completeSize: 9,
    first: 3,
    last: 5,
  });
});

test('handles invalid Content-Range header value with last byte pos less than first byte pos `bytes 43-42/99`', async () => {
  const res = parseByteContentRange('bytes 43-42/99');
  assert.deepEqual(res, undefined);
});

test('handles invalid Content-Range header value with complete length less than last byte pos `bytes 0-99/42`', async () => {
  const res = parseByteContentRange('bytes 0-99/42');
  assert.deepEqual(res, undefined);
});

test('handles malformed Content-Range header value `bytes 031/32`', async () => {
  const res = parseByteContentRange('bytes 031/32');
  assert.deepEqual(res, undefined);
});

test('handles malformed Content-Range header value `bytes 03132`', async () => {
  const res = parseByteContentRange('bytes 03132');
  assert.deepEqual(res, undefined);
});

test('handles malformed Content-Range header value `bytes a-b/c`', async () => {
  const res = parseByteContentRange('bytes a-b/c');
  assert.deepEqual(res, undefined);
});

test('handles non-bytes Content-Range header value `foo 0-22/42`', async () => {
  const res = parseByteContentRange('foo 0-22/42');
  assert.deepEqual(res, undefined);
});

await run(test);
