/// <reference path="../typings/mocha/mocha.d.ts"/>
import t = require('./test_support');

describe('functions', () => {
  it('supports declarations',
     () => { t.expectTranslate('function x() {}').to.equal(' x ( ) { }'); });
  it('supports param default values', () => {
    t.expectTranslate('function x(a = 42, b = 1) { return 42; }')
        .to.equal(' x ( [ a = 42 , b = 1 ] ) { return 42 ; }');
    t.expectTranslate('function x(p1, a = 42, b = 1, p2) { return 42; }')
        .to.equal(' x ( p1 , [ a = 42 , b = 1 , p2 ] ) { return 42 ; }');
  });
  it('supports empty returns',
     () => { t.expectTranslate('function x() { return; }').to.equal(' x ( ) { return ; }'); });
  it('supports named parameters', () => {
    t.expectTranslate('function x({a = "x", b}) { return a + b; }')
        .to.equal(' x ( { a : "x" , b } ) { return a + b ; }');
  });
  // TODO(martinprobst): Support types on named parameters.
  it.skip('fails for types on named parameters', () => {
    t.expectErroneousCode('function x({a}: number) { return a + b; }')
        .to.throw('types on named parameters are unsupported');
  });
  it('does not support var args', () => {
    t.expectErroneousCode('function x(...a: number) { return 42; }')
        .to.throw('rest parameters are unsupported');
  });
  it('does not support generic functions', () => {
    t.expectErroneousCode('function x<T>() { return 42; }')
        .to.throw('generic functions are unsupported');
  });
  it('translates function expressions',
     () => { t.expectTranslate('var a = function() {}').to.equal(' var a = ( ) { } ;'); });
  it('translates fat arrow operator', () => {
    t.expectTranslate('var a = () => {}').to.equal(' var a = ( ) { } ;');
    t.expectTranslate('var a = (p) => isBlank(p)').to.equal(' var a = ( p ) => isBlank ( p ) ;');
    t.expectTranslate('var a = (p = null) => isBlank(p)')
        .to.equal(' var a = ( [ p = null ] ) => isBlank ( p ) ;');
  });
});
