/**
 * Represents the size of bytes
 *
 * @example
 * Bytes.kibiBytes(42); // 42 kibibytes in bytes
 * Bytes.mebiBytes(42); // 42 mebibytes in bytes
 */
export default class Bytes {
  static bytes(n: number): number {
    return n;
  }

  static kibiBytes(n: number): number {
    return n * 1024;
  }

  static mebiBytes(n: number): number {
    return n * this.kibiBytes(1024);
  }
}
