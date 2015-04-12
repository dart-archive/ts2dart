/// <reference path="../typings/mocha/mocha.d.ts"/>
import t = require('./test_support');

describe('calls', () => {
  it('translates destructuring parameters', () => {
    t.expectTranslate('function x({p = null, d = false} = {}) {}')
        .to.equal(' x ( { p : null , d : false } ) { }');
    t.expectErroneousCode('function x({a=false}={a:true})')
        .to.throw('initializers for named parameters must be empty object literals');
    t.expectErroneousCode('function x({a=false}=true)')
        .to.throw('initializers for named parameters must be empty object literals');
    t.expectTranslate('class X { constructor() { super({p: 1}); } }')
        .to.equal(' class X { X ( ) : super ( p : 1 ) {' +
                  ' /* super call moved to initializer */ ; } }');
  });
  it('hacks last object literal parameters into named parameter', () => {
    t.expectTranslate('f(x, {a: 12, b: 4});').to.equal(' f ( x , a : 12 , b : 4 ) ;');
    t.expectTranslate('f({a: 12});').to.equal(' f ( a : 12 ) ;');
    t.expectTranslate('f({"a": 12});').to.equal(' f ( { "a" : 12 } ) ;');
    t.expectTranslate('new X(x, {a: 12, b: 4});').to.equal(' new X ( x , a : 12 , b : 4 ) ;');
    t.expectTranslate('f(x, {});').to.equal(' f ( x , { } ) ;');
  });
  it('translates calls', () => {
    t.expectTranslate('foo();').to.equal(' foo ( ) ;');
    t.expectTranslate('foo(1, 2);').to.equal(' foo ( 1 , 2 ) ;');
  });
  it('translates new calls', () => {
    t.expectTranslate('new Foo();').to.equal(' new Foo ( ) ;');
    t.expectTranslate('new Foo(1, 2);').to.equal(' new Foo ( 1 , 2 ) ;');
  });
  it('translates "super()" constructor calls', () => {
    t.expectTranslate('class X { constructor() { super(1); } }')
        .to.equal(' class X { X ( ) : super ( 1 ) { /* super call moved to initializer */ ; } }');
    t.expectErroneousCode('class X { constructor() { if (y) super(1, 2); } }')
        .to.throw('super calls must be immediate children of their constructors');
    t.expectTranslate('class X { constructor() { a(); super(1); b(); } }')
        .to.equal(' class X { X ( ) : super ( 1 ) {' +
                  ' a ( ) ; /* super call moved to initializer */ ; b ( ) ;' +
                  ' } }');
  });
  it('translates "super.x()" super method calls', () => {
    t.expectTranslate('class X { y() { super.z(1); } }')
        .to.equal(' class X { y ( ) { super . z ( 1 ) ; } }');
  });
});
