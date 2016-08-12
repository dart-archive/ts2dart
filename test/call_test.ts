/// <reference path="../typings/mocha/mocha.d.ts"/>
import {expectErroneousCode, expectTranslate} from './test_support';

describe('calls', () => {
  it('translates destructuring parameters', () => {
    expectTranslate('function x({p = null, d = false} = {}) {}')
        .to.equal('x({p: null, d: false}) {}');
    expectErroneousCode('function x({a=false}={a:true})')
        .to.throw('cannot have both an inner and outer initializer');
    expectErroneousCode('function x({a=false}=true)')
        .to.throw('initializers for named parameters must be object literals');
    expectTranslate('class X { constructor() { super({p: 1}); } }').to.equal(`class X {
  X() : super(p: 1) {
    /* super call moved to initializer */;
  }
}`);
  });
  it('hacks last object literal parameters into named parameter', () => {
    expectTranslate('f(x, {a: 12, b: 4});').to.equal('f(x, a: 12, b: 4);');
    expectTranslate('f({a: 12});').to.equal('f(a: 12);');
    expectTranslate('f({"a": 12});').to.equal('f({"a": 12});');
    expectTranslate('new X(x, {a: 12, b: 4});').to.equal('new X(x, a: 12, b: 4);');
    expectTranslate('f(x, {});').to.equal('f(x, {});');
  });
  it('translates calls', () => {
    expectTranslate('foo();').to.equal('foo();');
    expectTranslate('foo(1, 2);').to.equal('foo(1, 2);');
  });
  it('translates new calls', () => {
    expectTranslate('new Foo();').to.equal('new Foo();');
    expectTranslate('new Foo(1, 2);').to.equal('new Foo(1, 2);');
    expectTranslate('new Foo<number, string>(1, 2);').to.equal('new Foo<num, String>(1, 2);');
  });
  it('supports generic type parameters',
     () => { expectTranslate('var s = foo<string>();').to.equal('var s = foo/*< String >*/();'); });
  it('translates "super()" constructor calls', () => {
    expectTranslate('class X { constructor() { super(1); } }').to.equal(`class X {
  X() : super(1) {
    /* super call moved to initializer */;
  }
}`);
    expectErroneousCode('class X { constructor() { if (y) super(1, 2); } }')
        .to.throw('super calls must be immediate children of their constructors');
    expectTranslate('class X { constructor() { a(); super(1); b(); } }').to.equal(`class X {
  X() : super(1) {
    a();
    /* super call moved to initializer */
    ;
    b();
  }
}`);
  });
  it('translates "super.x()" super method calls', () => {
    expectTranslate('class X { y() { super.z(1); } }').to.equal(`class X {
  y() {
    super.z(1);
  }
}`);
  });
  it('transpiles new calls without arguments',
     () => { expectTranslate('new Foo;').to.equal('new Foo();'); });
});
