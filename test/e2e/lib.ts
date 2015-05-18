import {CONST_EXPR} from "somewhere";

@CONST
class MyClass {
  private _error: string = "error";
  constructor(private _field: string) {}

  get field(): string {
    // TODO: TypeScript doesn't parse the RHS as StringKeyword so we lose
    // the translation of string -> String.
    // We use capital S String here, even though it wouldn't run in TS.
    if (" world" instanceof String) {
      return this._field + " world";
    } else {
      return this._error;
    }
  }

  namedParam({x = "?"}) { return 'hello' + x; }
}

class MySubclass extends MyClass {
  constructor(_field: string) { super(_field); }
  get subclassField(): string { return this.field; }
}

const SomeArray = CONST_EXPR([1, 2, 3]);
