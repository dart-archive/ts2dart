/// <reference path="../typings/mocha/mocha.d.ts"/>
import {expectTranslate} from './test_support';

describe('types', () => {
  it('supports qualified names',
     () => { expectTranslate('var x: foo.Bar;').to.equal(' foo . Bar x ;'); });
  it('drops type literals',
     () => { expectTranslate('var x: {x: string, y: number};').to.equal(' dynamic x ;'); });
  it('substitutes Dart-ism', () => {
    expectTranslate('import {Promise} from "./somewhere"; var p: Promise<Date>;')
        .to.equal(' import "somewhere.dart" show Future ; Future < DateTime > p ;');
    expectTranslate('import Promise = require("./somewhere");')
        .to.equal(' import "somewhere.dart" as Future ;');
    expectTranslate('x instanceof Promise;').to.equal(' x is Future ;');
  });
  it('allows typecasts',
     () => { expectTranslate('<MyType>ref').to.equal(' ( ref as MyType ) ;'); });
  it('does not mangle prototype names', () => {
    expectTranslate('import toString = require("./somewhere");')
        .to.equal(' import "somewhere.dart" as toString ;');
  });
});

describe('type arguments', () => {
  it('should support declaration', () => {
    expectTranslate('class X<A, B> { a: A; }').to.equal(' class X < A , B > { A a ; }');
  });
  it('should support nested extends', () => {
    expectTranslate('class X<A extends B<C>> { }').to.equal(' class X < A extends B < C > > { }');
  });
  it('should multiple extends', () => {
    expectTranslate('class X<A extends A1, B extends B1> { }')
        .to.equal(' class X < A extends A1 , B extends B1 > { }');
  });
  it('should support use', () => {
    expectTranslate('class X extends Y<A, B> { }').to.equal(' class X extends Y < A , B > { }');
  });
});
