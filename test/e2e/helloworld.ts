import t = require("unittest/unittest");

class MyClass {
  field: string;

  MyClass(someVal: string) { this.field = someVal; }

  getField(): string { return this.field + " world"; }
}

function main(): void {
  t.test("bigifies text", function() { t.expect("hello".toUpperCase(), t.equals("HELLO")); });
  t.test("handles classes", function() {
    var mc = new MyClass("hello");
    t.expect(mc.field.toUpperCase(), t.equals("HELLO WORLD"));
  });
}
