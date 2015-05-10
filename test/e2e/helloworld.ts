import t = require("unittest/unittest");
import {MyClass, SomeArray} from './lib';

function main(): void {
  t.test("handles classes", function() {
    var mc = new MyClass("hello");
    t.expect(mc.field.toUpperCase(), t.equals("HELLO WORLD"));
    t.expect(mc.namedParam({x: '!'}), t.equals("hello!"));
    t.expect(mc.namedParam(), t.equals("hello?"));
  });
  t.test("string templates", function() {
    t.expect("$mc", t.equals("$mc"));
    var a = "hello";
    var b = "world";
    t.expect(`${a} ${b}`, t.equals("hello world"));
  });
  t.test("const expr", function() {
    t.expect(SomeArray[0], t.equals(1));
  });
}
