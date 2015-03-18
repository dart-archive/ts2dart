import t = require("unittest/unittest");
import {MyClass} from './lib';

function main(): void {
  t.test("handles classes", function() {
    var mc = new MyClass("hello");
    t.expect(mc.getField().toUpperCase(), t.equals("HELLO WORLD"));
  });
}
