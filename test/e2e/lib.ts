class MyClass {
  field: string;

  MyClass(someVal: string) { this.field = someVal; }

  getField(): string {
    // TODO: TypeScript doesn't parse the RHS as StringKeyword so we lose
    // the translation of string -> String.
    // We use capital S String here, even though it wouldn't run in TS.
    if (" world" instanceof String) {
      return this.field + " world";
    } else {
      return "error";
    }
  }
}
