import path from 'path';
import type { Test } from 'baretest';

export function filename(s: string) {
  const { name } = path.parse(s);
  return name;
}

export async function run(test: Test) {
  if (!await test.run()) {
    process.exit(1);
  }
}
