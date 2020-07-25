import { strict as assert } from 'assert';
import baretest from 'baretest';
import { getRedundantByteCount, getSegmentRanges, getSegmentSize } from '../../src';
import Bytes from '../../src/bytes';
import { filename, run } from './helpers';

const test = baretest(filename(import.meta.url));
const tests = [
  [Bytes.kibiBytes(1),   Bytes.kibiBytes(1)  ],
  [Bytes.kibiBytes(128), Bytes.kibiBytes(100)],
  [Bytes.kibiBytes(512), Bytes.kibiBytes(500)],
  [Bytes.mebiBytes(1),   Bytes.mebiBytes(1)  ],
  [Bytes.mebiBytes(2),   Bytes.mebiBytes(1)  ],
  [Bytes.mebiBytes(4),   Bytes.mebiBytes(1)  ],
  [Bytes.mebiBytes(6),   Bytes.mebiBytes(1)  ],
  [Bytes.bytes(32),      Bytes.bytes(32)     ],
  [Bytes.bytes(128),     Bytes.bytes(128)    ],
];

tests.forEach(([contentLength, expectedSegmentSize]) => {
  test(`getSegmentSize(${contentLength}) is ${expectedSegmentSize}`, async () => {
    assert.equal(getSegmentSize(contentLength), expectedSegmentSize);
  });
});

test('a 13 byte segment size for a 13 byte resource does NOT have redundant bytes', async () => {
  assert.equal(getRedundantByteCount(13, 13, 0), 0);
});

test('a segment size larger than the content throws', async () => {
  assert.throws(() => getRedundantByteCount(13, 14, 0));
});

test('a segment start index larger than the content throws', async () => {
  assert.throws(() => getRedundantByteCount(13, 11, 14));
});

test('a 6 byte segment size for a 13 byte resource does have 5 redundant bytes', async () => {
  // [ 0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12]
  //  ^--------------------^
  //         Request 1
  //                          ^--------------------^
  //                                 Request 2
  //                              ^--------------------^
  //                                     Request 3
  assert.equal(getRedundantByteCount(13, 6, 12), 5);
});

test('segments a 13 byte resource into one 13 byte request', async () => {
  const ranges = getSegmentRanges(13, 13, 0);
  assert.equal(ranges.length, 1);
  assert.deepEqual(ranges, [{
    start: 0,
    end: 12,
    redundant: 0,
  }]);
});

test('segments a 13 byte resource into three 6 byte requests', async () => {
  // [ 0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12]
  //  ^--------------------^
  //         Request 1
  //                          ^--------------------^
  //                                 Request 2
  //                              ^--------------------^
  //                                     Request 3
  const ranges = getSegmentRanges(13, 6, 0);
  assert.equal(ranges.length, 3);
  assert.deepEqual(ranges, [{
    start: 0,
    end: 5,
    redundant: 0,
  }, {
    start: 6,
    end: 11,
    redundant: 0,
  }, {
    start: 7,
    end: 12,
    redundant: 5,
  }]);
});

test('segments a 200 byte resource into two 100 byte requests', async () => {
  const ranges = getSegmentRanges(200, 100, 0);
  assert.equal(ranges.length, 2);
  assert.deepEqual(ranges, [{
    start: 0,
    end: 99,
    redundant: 0,
  }, {
    start: 100,
    end: 199,
    redundant: 0,
  }]);
});

test('segments a 101 byte resource into two 100 byte requests', async () => {
  const ranges = getSegmentRanges(101, 100, 0);
  assert.equal(ranges.length, 2);
  assert.deepEqual(ranges, [{
    start: 0,
    end: 99,
    redundant: 0,
  }, {
    start: 1,
    end: 100,
    redundant: 99,
  }]);
});

test('segments a 2M resource into two 1M requests', async () => {
  const ranges = getSegmentRanges(Bytes.mebiBytes(2), Bytes.mebiBytes(1), 0);
  assert.equal(ranges.length, 2);
  assert.deepEqual(ranges, [{
    start: 0,
    end: Bytes.mebiBytes(1) - 1,
    redundant: 0,
  }, {
    start: Bytes.mebiBytes(1),
    end: Bytes.mebiBytes(2) - 1,
    redundant: 0,
  }]);
});

test('segments a 2M resource into two 1M requests starting at 1K', async () => {
  const ranges = getSegmentRanges(Bytes.mebiBytes(2), Bytes.mebiBytes(1), Bytes.kibiBytes(1));
  assert.equal(ranges.length, 2);
  assert.deepEqual(ranges, [{
    start: Bytes.kibiBytes(1),
    end: Bytes.kibiBytes(1) + Bytes.mebiBytes(1) - 1,
    redundant: 0,
  }, {
    start: Bytes.mebiBytes(1),
    end: Bytes.mebiBytes(2) - 1,
    redundant: Bytes.kibiBytes(1),
  }]);
});

test('segments a 2M resource into two 1M requests starting at 1K - 1', async () => {
  const ranges = getSegmentRanges(Bytes.mebiBytes(2), Bytes.mebiBytes(1), Bytes.kibiBytes(1) - 1);
  assert.equal(ranges.length, 2);
  assert.deepEqual(ranges, [{
    start: Bytes.kibiBytes(1) - 1,
    end: Bytes.kibiBytes(1) + Bytes.mebiBytes(1) - 1 - 1,
    redundant: 0,
  }, {
    start: Bytes.mebiBytes(1),
    end: Bytes.mebiBytes(2) - 1,
    redundant: Bytes.kibiBytes(1) - 1,
  }]);
});

await run(test);
