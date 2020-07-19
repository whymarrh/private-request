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
