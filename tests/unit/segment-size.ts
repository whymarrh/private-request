import { strict as assert } from 'assert';
import baretest from 'baretest';
import { getSegmentSize } from '../../src';
import Bytes from '../../src/bytes';
import { filename } from './helpers';

const test = baretest(filename(__filename));
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

// Run all tests

(async () => await test.run())();
