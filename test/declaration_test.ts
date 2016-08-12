/// <reference path="../typings/mocha/mocha.d.ts"/>
import {expectErroneousCode, expectTranslate} from './test_support';

describe('variables', () => {
  it('should print variable declaration with initializer',
     () => { expectTranslate('var a:number = 1;').to.equal('num a = 1;'); });
  it('should print variable declaration', () => {
    expectTranslate('var a:number;').to.equal('num a;');
    expectTranslate('var a;').to.equal('var a;');
    expectTranslate('var a:any;').to.equal('dynamic a;');
  });
  it('should transpile variable declaration lists', () => {
    expectTranslate('var a: A;').to.equal('A a;');
    expectTranslate('var a, b;').to.equal('var a, b;');
  });
  it('should transpile variable declaration lists with initializers', () => {
    expectTranslate('var a = 0;').to.equal('var a = 0;');
    expectTranslate('var a, b = 0;').to.equal('var a, b = 0;');
    expectTranslate('var a = 1, b = 0;').to.equal('var a = 1, b = 0;');
  });
  it('does not support vardecls containing more than one type (implicit or explicit)', () => {
    let msg = 'Variables in a declaration list of more than one variable cannot by typed';
    expectErroneousCode('var a: A, untyped;').to.throw(msg);
    expectErroneousCode('var untyped, b: B;').to.throw(msg);
    expectErroneousCode('var n: number, s: string;').to.throw(msg);
    expectErroneousCode('var untyped, n: number, s: string;').to.throw(msg);
  });

  it('supports const', () => {
    // NB: const X = CONST_EXPR(1); is translated as deep-const, see tests in facade_converter_test.
    // Arbitrary expressions translate const ==> final...
    expectTranslate('const A = 1 + 2;').to.equal('final A = 1 + 2;');
    // ... but literals are special cased to be deep const.
    expectTranslate('const A = 1, B = 2;').to.equal('const A = 1, B = 2;');
    expectTranslate('const A: number = 1;').to.equal('const num A = 1;');
  });
});

describe('classes', () => {
  it('should translate classes', () => { expectTranslate('class X {}').to.equal('class X {}'); });
  it('should support extends',
     () => { expectTranslate('class X extends Y {}').to.equal('class X extends Y {}'); });
  it('should support implements', () => {
    expectTranslate('class X implements Y, Z {}').to.equal('class X implements Y, Z {}');
  });
  it('should support implements', () => {
    expectTranslate('class X extends Y implements Z {}')
        .to.equal('class X extends Y implements Z {}');
  });
  it('should support abstract',
     () => { expectTranslate('abstract class X {}').to.equal('abstract class X {}'); });

  describe('members', () => {
    it('supports empty declarations',
       () => { expectTranslate('class X { ; }').to.equal('class X {}'); });
    it('supports fields', () => {
      expectTranslate('class X { x: number; y: string; }').to.equal(`class X {
  num x;
  String y;
}`);
      expectTranslate('class X { x; }').to.equal(`class X {
  var x;
}`);
    });
    it('supports function typed fields', () => {
      expectTranslate(
          'interface FnDef {(y: number): string;}\n' +
          'class X { x: FnDef; }')
          .to.equal(`typedef String FnDef(num y);

class X {
  FnDef x;
}`);
    });
    it('supports field initializers', () => {
      expectTranslate('class X { x: number = 42; }').to.equal(`class X {
  num x = 42;
}`);
    });
    // TODO(martinprobst): Re-enable once Angular is migrated to TS.
    it('supports visibility modifiers', () => {
      expectTranslate('class X { private _x; x; }').to.equal(`class X {
  var _x;
  var x;
}`);
      expectErroneousCode('class X { private x; }')
          .to.throw('private members must be prefixed with "_"');
      expectErroneousCode('class X { constructor (private x) {} }')
          .to.throw('private members must be prefixed with "_"');
      expectErroneousCode('class X { _x; }')
          .to.throw('public members must not be prefixed with "_"');
    });
    it('does not support protected', () => {
      expectErroneousCode('class X { protected x; }')
          .to.throw('protected declarations are unsupported');
    });
    it('supports static fields', () => {
      expectTranslate('class X { static x: number = 42; }').to.equal(`class X {
  static num x = 42;
}`);
    });
    it('supports methods', () => {
      expectTranslate('class X { x() { return 42; } }').to.equal(`class X {
  x() {
    return 42;
  }
}`);
    });
    it('supports abstract methods', () => {
      expectTranslate('abstract class X { abstract x(); }').to.equal(`abstract class X {
  x();
}`);
    });
    it('supports method return types', () => {
      expectTranslate('class X { x(): number { return 42; } }').to.equal(`class X {
  num x() {
    return 42;
  }
}`);
    });
    it('supports method params', () => {
      expectTranslate('class X { x(a, b) { return 42; } }').to.equal(`class X {
  x(a, b) {
    return 42;
  }
}`);
    });
    it('supports method return types', () => {
      expectTranslate('class X { x( a : number, b : string ) { return 42; } }').to.equal(`class X {
  x(num a, String b) {
    return 42;
  }
}`);
    });
    it('supports get methods', () => {
      expectTranslate('class X { get y(): number {} }').to.equal(`class X {
  num get y {}
}`);
      expectTranslate('class X { static get Y(): number {} }').to.equal(`class X {
  static num get Y {}
}`);
    });
    it('supports set methods', () => {
      expectTranslate('class X { set y(n: number) {} }').to.equal(`class X {
  set y(num n) {}
}`);
      expectTranslate('class X { static get Y(): number {} }').to.equal(`class X {
  static num get Y {}
}`);
    });
    it('supports constructors', () => {
      expectTranslate('class X { constructor() {} }').to.equal(`class X {
  X() {}
}`);
    });
    it('supports parameter properties', () => {
      expectTranslate(
          'class X { c: number; \n' +
          '  constructor(private _bar: B, ' +
          'public foo: string = "hello", ' +
          'private _goggles: boolean = true) {} }')
          .to.equal(`class X {
  B _bar;
  String foo;
  bool _goggles;
  num c;
  X(this._bar, [this.foo = "hello", this._goggles = true]) {}
}`);
      expectTranslate(
          '@CONST class X { ' +
          'constructor(public foo: string, b: number, private _marbles: boolean = true) {} }')
          .to.equal(`class X {
  final String foo;
  final bool _marbles;
  const X(this.foo, num b, [this._marbles = true]);
}`);
      expectTranslate(`/* @ts2dart_const */ class X {
  constructor(public foo: string) {}
  foo() { return new Bar(); }
}`).to.equal(`/* @ts2dart_const */
class X {
  final String foo;
  const X(this.foo);
  foo() {
    return new Bar();
  }
}`);
    });
  });
});

describe('interfaces', () => {
  it('translates interfaces to abstract classes',
     () => { expectTranslate('interface X {}').to.equal('abstract class X {}'); });
  it('translates interface extends to class implements', () => {
    expectTranslate('interface X extends Y, Z {}').to.equal('abstract class X implements Y, Z {}');
  });
  it('supports abstract methods', () => {
    expectTranslate('interface X { x(); }').to.equal(`abstract class X {
  x();
}`);
  });
  it('supports interface properties', () => {
    expectTranslate('interface X { x: string; y; }').to.equal(`abstract class X {
  String x;
  var y;
}`);
  });
});

describe('single call signature interfaces', () => {
  it('should support declaration', () => {
    expectTranslate('interface F { (n: number): boolean; }').to.equal('typedef bool F(num n);');
  });
  it('should support generics', () => {
    expectTranslate('interface F<A, B> { (a: A): B; }').to.equal('typedef B F<A, B>(A a);');
  });
});

describe('enums', () => {
  it('should support basic enum declaration', () => {
    expectTranslate('enum Color { Red, Green, Blue }').to.equal('enum Color { Red, Green, Blue }');
  });
  it('does not support empty enum',
     () => { expectErroneousCode('enum Empty {}').to.throw('empty enums are not supported'); });
  it('does not support enum with initializer', () => {
    expectErroneousCode('enum Color { Red = 1, Green, Blue = 4 }')
        .to.throw('enum initializers are not supported');
  });
  it('should support switch over enum', () => {
    expectTranslate('switch(c) { case Color.Red: break; default: break; }').to.equal(`switch (c) {
  case Color.Red:
    break;
  default:
    break;
}`);
  });
  it('does not support const enum', () => {
    expectErroneousCode('const enum Color { Red }').to.throw('const enums are not supported');
  });
});
