/// <reference path="./test.d.ts"/>
/// <reference path="./typings/es6-promise/es6-promise.d.ts"/>
import t = require("test/test");
import {MyClass, MySubclass, SomeArray} from './lib';

function callOne<T, U>(a: (t: T) => U, t: T): U {
  return a(t);
}

function main(): void {
  t.test("handles classes", function() {
    var mc = new MyClass("hello");
    t.expect(mc.field.toUpperCase(), t.equals("HELLO WORLD"));
    t.expect(mc.namedParam({x: '!'}), t.equals("hello!"));
    t.expect(mc.namedParam(), t.equals("hello?"));
  });
  t.test("allows subclassing and casts", function() {
    var mc: MyClass;
    mc = new MySubclass("hello");
    t.expect((<MySubclass>mc).subclassField, t.equals("hello world"));
  });
  t.test("string templates", function() {
    t.expect("$mc", t.equals("$mc"));
    var a = "hello";
    var b = "world";
    t.expect(`${a} ${b}`, t.equals("hello world"));
  });
  t.test("regexp", function() {
    t.expect(/o\./g.test("fo.o"), t.equals(true));
    t.expect(/o/g.exec("fo.o").length, t.equals(2));
  });
  t.test("const expr", function() { t.expect(SomeArray[0], t.equals(1)); });
  t.test('generic types fn', function() { t.expect(callOne((a) => a, 1), t.equals(1)); });

  t.test("promises", function() {
    let p: Promise<number> = new Promise<number>((resolve) => { resolve(1); });
    p.then((n) => { t.expect(n, t.equals(1)); });
  });
}
