export default {
  bytes(n: number): number {
    return n;
  },

  kibiBytes(n: number): number {
    return n * 1024;
  },

  mebiBytes(n: number): number {
    return n * this.kibiBytes(1024);
  },
};
