declare module 'pure-random-number' {
  export function randomSync(minimum: number, maximum: number): number;

  export default function secureRandomNumber(minimum: number, maximum: number): Promise<number>;
}
