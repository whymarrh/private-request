declare module 'baretest' {
  export interface Test {
    (name: string, fn: Function): void;
    run(): Promise<boolean>;
    skip(fn: Function): void;
    before(fn: Function): void;
    after(fn: Function): void;
    only(name: string, fn: Function): void;
  }

  export interface Baretest {
    (headline: string): Test;
  }

  export default function (headline: string): Test;
}
