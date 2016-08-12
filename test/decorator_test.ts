/// <reference path="../typings/mocha/mocha.d.ts"/>
import {expectErroneousCode, expectTranslate} from './test_support';

describe('decorators', () => {
  it('translates plain decorators', () => {
    expectTranslate('@A class X {}').to.equal(`@A
class X {}`);
  });
  it('translates plain decorators when applied to abstract classes', () => {
    expectTranslate('@A abstract class X {}').to.equal(`@A
abstract class X {}`);
  });
  it('translates arguments', () => {
    expectTranslate('@A(a, b) class X {}').to.equal(`@A(a, b)
class X {}`);
  });
  it('translates const arguments', () => {
    expectTranslate('@A([1]) class X {}').to.equal(`@A(const [1])
class X {}`);
    expectTranslate('@A({"a": 1}) class X {}').to.equal(`@A(const {"a": 1})
class X {}`);
    expectTranslate('@A(new B()) class X {}').to.equal(`@A(const B())
class X {}`);
  });
  it('translates on functions', () => {
    expectTranslate('@A function f() {}').to.equal(`@A
f() {}`);
  });
  it('translates on properties', () => {
    expectTranslate('class X { @A p; }').to.equal(`class X {
  @A
  var p;
}`);
  });
  it('translates on parameters',
     () => { expectTranslate('function f (@A p) {}').to.equal('f(@A p) {}'); });
  it('special cases @CONST', () => {
    expectTranslate('@CONST class X {}').to.equal(`class X {
  const X();
}`);
    expectTranslate('@CONST() class X {}').to.equal(`class X {
  const X();
}`);
    expectTranslate(`@CONST class X {
                       x: number;
                       y;
                       constructor() { super(3); this.x = 1; this.y = 2; }
                     }`)
        .to.equal(`class X {
  final num x;
  final y;
  const X()
      : x = 1,
        y = 2,
        super(3);
}`);

    // @CONST constructors.
    expectTranslate('@CONST class X { constructor() {} }').to.equal(`class X {
  const X();
}`);
    // For backwards-compatibility for traceur inputs (not valid TS input)
    expectTranslate('class X { @CONST constructor() {} }').to.equal(`class X {
  const X();
}`);
    expectErroneousCode('@CONST class X { constructor() { if (1); } }')
        .to.throw('const constructors can only contain assignments and super calls');
    expectErroneousCode('@CONST class X { constructor() { f(); } }')
        .to.throw('const constructors can only contain assignments and super calls');
    expectErroneousCode('@CONST class X { constructor() { "string literal"; } }')
        .to.throw('const constructors can only contain assignments and super calls');
    expectErroneousCode('class X { @CONST constructor() { x = 1; } }')
        .to.throw('assignments in const constructors must assign into this.');
    expectErroneousCode('class X { @CONST constructor() { thax = 1; } }')
        .to.throw('assignments in const constructors must assign into this.');

    // @CONST properties.
    expectTranslate('class Foo { @CONST() static foo = 1; }').to.equal(`class Foo {
  static const foo = 1;
}`);
  });
});
