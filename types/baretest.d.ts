declare module 'baretest' {
  interface Baretest {
    (name: string, fn: Function): void;
    run(): Promise<boolean>;
    skip(fn: Function): void;
    before(fn: Function): void;
    after(fn: Function): void;
    only(name: string, fn: Function): void;
  }

  export default function (headline: string): Baretest;
}
