/// <reference path="../typings/mocha/mocha.d.ts"/>
import {expectTranslate} from './test_support';

describe('types', () => {
  it('supports qualified names',
     () => { expectTranslate('var x: foo.Bar;').to.equal('foo.Bar x;'); });
  it('drops type literals',
     () => { expectTranslate('var x: {x: string, y: number};').to.equal('dynamic x;'); });
  it('translates string index signatures to dartisms', () => {
    expectTranslate('var x: {[k: string]: any[]};').to.equal('Map<String, List<dynamic>> x;');
    expectTranslate('var x: {[k: number]: number};').to.equal('Map<num, num> x;');
  });
  it('drops type literals with index signatures and other properties',
     () => { expectTranslate('var x: {a: number, [k: string]: number};').to.equal('dynamic x;'); });
  it('allows typecasts', () => { expectTranslate('<MyType>ref').to.equal('(ref as MyType);'); });
  it('translates typecasts to reified types on literals', () => {
    expectTranslate('let x = <string[]>[];').to.equal('var x = <String>[];');
    expectTranslate('let x = <{[k:string]: number}>{};').to.equal('var x = <String, num>{};');
  });
  it('does not mangle prototype names', () => {
    expectTranslate('import toString = require("./somewhere");')
        .to.equal('import "somewhere.dart" as toString;');
  });
  it('should support union types', () => {
    expectTranslate('var x: number|List<string> = 11;')
        .to.equal('dynamic /* num | List< String > */ x = 11;');
    expectTranslate('function x(): number|List<{[k: string]: any}> { return 11; }')
        .to.equal(
            'dynamic /* num | List< Map < String , dynamic > > */ x() {\n' +
            '  return 11;\n' +
            '}');
  });
  it('should support array types',
     () => { expectTranslate('var x: string[] = [];').to.equal('List<String> x = [];'); });
  it('should support function types (by ignoring them)', () => {
    expectTranslate('var x: (a: string) => string;')
        .to.equal('dynamic /* (a: string) => string */ x;');
  });
});

describe('type arguments', () => {
  it('should support declaration', () => {
    expectTranslate('class X<A, B> { a: A; }').to.equal(`class X<A, B> {
  A a;
}`);
  });
  it('should support nested extends', () => {
    expectTranslate('class X<A extends B<C>> { }').to.equal('class X<A extends B<C>> {}');
  });
  it('should multiple extends', () => {
    expectTranslate('class X<A extends A1, B extends B1> { }')
        .to.equal('class X<A extends A1, B extends B1> {}');
  });
  it('should support use', () => {
    expectTranslate('class X extends Y<A, B> { }').to.equal('class X extends Y<A, B> {}');
  });
  it('should remove single <void> generic argument', () => {
    expectTranslate('var x: X<number>;').to.equal('X<num> x;');
    expectTranslate('class X extends Y<void> { }').to.equal('class X extends Y {}');
    expectTranslate('var x = new Promise<void>();').to.equal('var x = new Promise();');
  });
});
