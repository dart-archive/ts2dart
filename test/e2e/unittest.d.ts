declare module 'unittest/unittest' {
  function test(msg: string, fn: () => void);
  function expect(a: any, b: any);
  function equals(a: any): any;
}
