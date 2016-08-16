/// <reference path="../typings/mocha/mocha.d.ts"/>
import {expectErroneousCode, expectTranslate} from './test_support';

describe('functions', () => {
  it('supports declarations', () => { expectTranslate('function x() {}').to.equal('x() {}'); });
  it('supports param default values', () => {
    expectTranslate('function x(a = 42, b = 1) { return 42; }').to.equal(`x([a = 42, b = 1]) {
  return 42;
}`);
    expectTranslate('function x(p1, a = 42, b = 1, p2) { return 42; }')
        .to.equal(`x(p1, [a = 42, b = 1, p2]) {
  return 42;
}`);
    expectTranslate('function x(a = [], b = {}, c = new C()) { return 42; }')
        .to.equal(`x([a = const [], b = const {}, c = const C()]) {
  return 42;
}`);
  });
  it('translates optional parameters', () => {
    expectTranslate('function x(a?: number, b?: number) { return 42; }')
        .to.equal(`x([num a, num b]) {
  return 42;
}`);
    expectTranslate('function x(p1, a?: number, b?: number, p2) { return 42; }')
        .to.equal(`x(p1, [num a, num b, p2]) {
  return 42;
}`);
  });
  it('supports empty returns', () => {
    expectTranslate('function x() { return; }').to.equal(`x() {
  return;
}`);
  });

  it('does not support var args', () => {
    expectErroneousCode('function x(...a: number) { return 42; }')
        .to.throw('rest parameters are unsupported');
  });
  it('translates function expressions',
     () => { expectTranslate('var a = function() {}').to.equal('var a = () {};'); });
  it('translates fat arrow operator', () => {
    expectTranslate('var a = () => {}').to.equal('var a = () {};');
    expectTranslate('var a = (): string => {}').to.equal('var a = /* String */ () {};');
    expectTranslate('var a = (p) => isBlank(p)').to.equal('var a = (p) => isBlank(p);');
    expectTranslate('var a = (p = null) => isBlank(p)')
        .to.equal('var a = ([p = null]) => isBlank(p);');
  });
  it('translates types on function expressions', () => {
    expectTranslate('let a = function(p: string): string { return p; };')
        .to.equal(`var a = /* String */ (String p) {
  return p;
};`);
  });
  it('supports function parameters', () => {
    expectTranslate('function f(fn: (a: A, b: B) => C) {}').to.equal('f(C fn(A a, B b)) {}');
  });
  it('supports recursive function parameters', () => {
    expectTranslate('function f(fn: (a: (b: B) => C) => D) {}').to.equal('f(D fn(C a(B b))) {}');
  });
  it('supports generic-typed function parameters', () => {
    expectTranslate('function f<T, U>(fn: (a: T, b: U) => T) {}', {
      translateBuiltins: true
    }).to.equal('f/*< T, U >*/(dynamic/*= T */ fn(dynamic/*= T */ a, dynamic/*= U */ b)) {}');
  });
  it('translates functions taking rest parameters to untyped Function', () => {
    expectTranslate('function f(fn: (...a: string[]) => number) {}').to.equal('f(Function fn) {}');
  });
});

describe('named parameters', () => {
  it('supports named parameters', () => {
    expectTranslate('function x({a = "x", b}) { return a + b; }', {
      translateBuiltins: true
    }).to.equal(`x({a: "x", b}) {
  return a + b;
}`);
  });
  it('supports types on named parameters', () => {
    expectTranslate('function x({a = 1, b = 2}: {a: number, b: number} = {}) { return a + b; }', {
      translateBuiltins: true
    }).to.equal(`x({num a: 1, num b: 2}) {
  return a + b;
}`);
  });
  it('supports reference types on named parameters', () => {
    expectTranslate(
        'interface Args { a: string; b: number }\n' +
            'function x({a, b, c}: Args) { return a + b; }',
        {translateBuiltins: true})
        .to.equal(`abstract class Args {
  String a;
  num b;
}

x({String a, num b, c}) {
  return a + b;
}`);
  });
  it('supports declared, untyped named parameters', () => {
    expectTranslate('function x({a, b}: {a: number, b}) { return a + b; }', {
      translateBuiltins: true
    }).to.equal(`x({num a, b}) {
  return a + b;
}`);
  });
  it('fails for non-property types on named parameters', () => {
    expectErroneousCode(
        'interface X { a(a: number); }\n' +
            'function x({a}: X) { return a + b; }',
        {translateBuiltins: true})
        .to.throw('X.a used for named parameter definition must be a property');
  });
});

describe('generic functions', () => {
  it('supports generic types', () => {
    expectTranslate('function sort<T, U>(xs: T[]): T[] { return xs; }', {
      translateBuiltins: true
    }).to.equal(`List<dynamic/*= T */ > sort/*< T, U >*/(List<dynamic/*= T */ > xs) {
  return xs;
}`);
    expectTranslate('function inGeneric<T, U>(x: T, y: Y<U>): T { return x; }', {
      translateBuiltins: true
    }).to.equal(`dynamic/*= T */ inGeneric/*< T, U >*/(
    dynamic/*= T */ x, Y<dynamic/*= U */ > y) {
  return x;
}`);
    expectTranslate('class X { sort<T, U>(xs: T[]): T[] { return xs; } }', {
      translateBuiltins: true
    }).to.equal(`class X {
  List<dynamic/*= T */ > sort/*< T, U >*/(List<dynamic/*= T */ > xs) {
    return xs;
  }
}`);
  });
  it('replaces type usage sites, but not idents', () => {
    expectTranslate(
        `function wobble<T, U>(u: U): T {
      let t: T = <T>u;
      for (let T of [1, 2]) {}
      return t;
    }`,
        {translateBuiltins: true})
        .to.equal(`dynamic/*= T */ wobble/*< T, U >*/(dynamic/*= U */ u) {
  dynamic/*= T */ t = (u as dynamic/*= T */);
  for (var T in [1, 2]) {}
  return t;
}`);
  });
  it('translates generic calls', () => {
    expectTranslate(
        `function wobble<T>(foo: T): T { return foo; }
        let f = foo<string>('hello');`,
        {translateBuiltins: true})
        .to.equal(`dynamic/*= T */ wobble/*< T >*/(dynamic/*= T */ foo) {
  return foo;
}

var f = foo/*< String >*/("hello");`);
  });
});
