/// <reference path="../typings/mocha/mocha.d.ts"/>
import {expectTranslate, expectErroneousCode} from './test_support';

describe('decorators', () => {
  it('translates plain decorators',
     () => { expectTranslate('@A class X {}').to.equal(' @ A class X { }'); });
  it('translates arguments',
     () => { expectTranslate('@A(a, b) class X {}').to.equal(' @ A ( a , b ) class X { }'); });
  it('translates const arguments', () => {
    expectTranslate('@A([1]) class X {}').to.equal(' @ A ( const [ 1 ] ) class X { }');
    expectTranslate('@A({"a": 1}) class X {}').to.equal(' @ A ( const { "a" : 1 } ) class X { }');
    expectTranslate('@A(new B()) class X {}').to.equal(' @ A ( const B ( ) ) class X { }');
  });
  it('translates on functions',
     () => { expectTranslate('@A function f() {}').to.equal(' @ A f ( ) { }'); });
  it('translates on properties',
     () => { expectTranslate('class X { @A p; }').to.equal(' class X { @ A var p ; }'); });
  it('translates on parameters',
     () => { expectTranslate('function f (@A p) {}').to.equal(' f ( @ A p ) { }'); });
  it('special cases @CONST', () => {
    expectTranslate('@CONST class X {}').to.equal(' @ CONST const class X { }');
    expectTranslate('@CONST() class X {}').to.equal(' @ CONST ( ) const class X { }');
    expectTranslate(`class X {
                       x: number;
                       y;
                       @CONST constructor() { super(3); this.x = 1; this.y = 2; }
                     }`)
        .to.equal(' class X {' +
                  ' final num x ; final y ;' +
                  ' @ CONST const X ( ) : x = 1 , y = 2 , super ( 3 ) ; }');
    expectTranslate('class X { @CONST constructor() {} }')
        .to.equal(' class X { @ CONST const X ( ) ; }');
    expectErroneousCode('class X { @CONST constructor() { if (1); } }')
        .to.throw('const constructors can only contain assignments and super calls');
    expectErroneousCode('class X { @CONST constructor() { f(); } }')
        .to.throw('const constructors can only contain assignments and super calls');
    expectErroneousCode('class X { @CONST constructor() { "string literal"; } }')
        .to.throw('const constructors can only contain assignments and super calls');
    expectErroneousCode('class X { @CONST constructor() { x = 1; } }')
        .to.throw('assignments in const constructors must assign into this.');
    expectErroneousCode('class X { @CONST constructor() { thax = 1; } }')
        .to.throw('assignments in const constructors must assign into this.');
  });
  it('special cases @ABSTRACT', () => {
    expectTranslate('@ABSTRACT class X {}').to.equal(' @ ABSTRACT abstract class X { }');
  });
  it('special cases @IMPLEMENTS', () => {
    expectTranslate('@IMPLEMENTS(Y, Z) class X {}')
        .to.equal(' @ IMPLEMENTS ( Y , Z ) class X implements Y , Z { }');
    expectTranslate('@IMPLEMENTS(Z) class X extends Y {}')
        .to.equal(' @ IMPLEMENTS ( Z ) class X extends Y implements Z { }');
    expectTranslate('@IMPLEMENTS(Z) class X implements Y {}')
        .to.equal(' @ IMPLEMENTS ( Z ) class X implements Y , Z { }');
  });

});

describe('annotation/decorator hack', () => {
  it('should strip "Annotation" from type names', () => {
    expectTranslate('@CONST class FooAnnotation {}').to.equal(' @ CONST const class Foo { }');
  });
  it('should strip "Annotation" from imports', () => {
    expectTranslate('import {FooAnnotation} from "foo";')
        .to.equal(' import "package:foo.dart" show Foo ;');
  });
});
