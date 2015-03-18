class MyClass {
  field: string;

  MyClass(someVal: string) { this.field = someVal; }

  getField(): string { return this.field + " world"; }
}
