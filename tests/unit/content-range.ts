import { strict as assert } from 'assert';
import baretest from 'baretest';
import { parseContentRangeHeaderValue } from '../../src';

const test = baretest('parseContentRangeHeader');

test('handles empty string value', async () => {
  const res = parseContentRangeHeaderValue('');
  assert.deepEqual(res, {
    size: undefined,
    rangeStart: undefined,
    rangeEnd: undefined,
  });
});

test('handles valid Content-Range header value', async () => {
  const res = parseContentRangeHeaderValue('bytes 0-31/32');
  assert.deepEqual(res, {
    size: 32,
    rangeStart: 0,
    rangeEnd: 31,
  });
});

test('handles Content-Range header value with leading zeros `bytes 03-05/09`', async () => {
  const res = parseContentRangeHeaderValue('bytes 03-05/09');
  assert.deepEqual(res, {
    size: 9,
    rangeStart: 3,
    rangeEnd: 5,
  });
});

test('handles malformed Content-Range header value `bytes 031/32`', async () => {
  const res = parseContentRangeHeaderValue('bytes 031/32');
  assert.deepEqual(res, {
    size: undefined,
    rangeStart: undefined,
    rangeEnd: undefined,
  });
});

test('handles malformed Content-Range header value `bytes 03132`', async () => {
  const res = parseContentRangeHeaderValue('bytes 03132');
  assert.deepEqual(res, {
    size: undefined,
    rangeStart: undefined,
    rangeEnd: undefined,
  });
});

test('handles malformed Content-Range header value `bytes a-b/c`', async () => {
  const res = parseContentRangeHeaderValue('bytes a-b/c');
  assert.deepEqual(res, {
    size: undefined,
    rangeStart: undefined,
    rangeEnd: undefined,
  });
});

// Run all tests

(async () => await test.run())();
