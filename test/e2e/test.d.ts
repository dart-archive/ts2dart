declare module 'test/test' {
  export function test(msg: string, fn: () => void);
  export function expect(a: any, b: any);
  export function equals(a: any): any;
}
