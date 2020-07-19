import path from 'path';

export function filename(s: string) {
  const { name } = path.parse(s);
  return name;
}
