/// <reference path="./unittest.d.ts"/>
import t = require("unittest/unittest");
import {MyClass, MySubclass, SomeArray} from './lib';


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
    t.expect(/o\./.test("fo.o"), t.equals(true));
    t.expect(/o/.exec("fo.o").length, t.equals(2));
  });
  t.test("const expr", function() { t.expect(SomeArray[0], t.equals(1)); });
}
