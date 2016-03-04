/// <reference path="../typings/mocha/mocha.d.ts"/>
import {expectTranslate, expectErroneousCode} from './test_support';

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
  it('supports named parameters', () => {
    expectTranslate('function x({a = "x", b}) { return a + b; }').to.equal(`x({a: "x", b}) {
  return a + b;
}`);
  });
  // TODO(martinprobst): Support types on named parameters.
  it.skip('fails for types on named parameters', () => {
    expectErroneousCode('function x({a}: number) { return a + b; }')
        .to.throw('types on named parameters are unsupported');
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
});

describe('generic functions', () => {
  it('supports generic types', () => {
    expectTranslate('function sort<T, U>(xs: T[]): T[] { return xs; }', {
      translateBuiltins: true
    }).to.equal(`List<dynamic/*= T */ > sort/*< T, U >*/(List<dynamic/*= T */ > xs) {
  return xs;
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

var f = foo /* < String > */ ("hello");`);
  });
});
