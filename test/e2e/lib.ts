@CONST
class MyClass {
  private _field: string;

  constructor(someVal: string) { this._field = someVal; }

  get field(): string {
    // TODO: TypeScript doesn't parse the RHS as StringKeyword so we lose
    // the translation of string -> String.
    // We use capital S String here, even though it wouldn't run in TS.
    if (" world" instanceof String) {
      return this._field + " world";
    } else {
      return "error";
    }
  }

  namedParam({x = "?"}) { return 'hello' + x; }
}
