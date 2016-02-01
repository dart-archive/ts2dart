declare module 'test/test' {
  function test(msg: string, fn: () => void);
  function expect(a: any, b: any);
  function equals(a: any): any;
}
