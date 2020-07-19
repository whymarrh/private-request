declare module 'baretest' {
  export interface Test {
    (name: string, fn: Function): void;
    run(): Promise<boolean>;
    skip(fn: Function): void;
    // This isn't real, but the fn does ignore its args
    skip(name: string, fn: Function): void;
    // This isn't real, but the fn does ignore its args
    skip(name: string): void;
    before(fn: Function): void;
    after(fn: Function): void;
    only(name: string, fn: Function): void;
  }

  export interface Baretest {
    (headline: string): Test;
  }

  export default function (headline: string): Test;
}
