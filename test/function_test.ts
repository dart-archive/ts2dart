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
  it('does not support generic functions', () => {
    expectErroneousCode('function x<T>() { return 42; }')
        .to.throw('generic functions are unsupported');
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
