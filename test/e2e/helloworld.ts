import t = require("unittest/unittest");

class MyClass {
  field: string;

  MyClass(someVal: string) { this.field = someVal; }

  getField(): string { return this.field + " world"; }
}

function main(): void {
  t.test("handles classes", function() {
    var mc = new MyClass("hello");
    t.expect(mc.getField().toUpperCase(), t.equals("HELLO WORLD"));
  });
}
