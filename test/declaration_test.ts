/// <reference path="../typings/mocha/mocha.d.ts"/>
import t = require('./test_support');

describe('variables', () => {
  it('should print variable declaration with initializer',
     () => { t.expectTranslate('var a:number = 1;').to.equal(' num a = 1 ;'); });
  it('should print variable declaration', () => {
    t.expectTranslate('var a:number;').to.equal(' num a ;');
    t.expectTranslate('var a;').to.equal(' var a ;');
    t.expectTranslate('var a:any;').to.equal(' dynamic a ;');
  });
  it('should transpile variable declaration lists', () => {
    t.expectTranslate('var a: A;').to.equal(' A a ;');
    t.expectTranslate('var a, b;').to.equal(' var a , b ;');
  });
  it('should transpile variable declaration lists with initializers', () => {
    t.expectTranslate('var a = 0;').to.equal(' var a = 0 ;');
    t.expectTranslate('var a, b = 0;').to.equal(' var a , b = 0 ;');
    t.expectTranslate('var a = 1, b = 0;').to.equal(' var a = 1 , b = 0 ;');
  });
  it('does not support vardecls containing more than one type (implicit or explicit)', () => {
    var msg = 'Variables in a declaration list of more than one variable cannot by typed';
    t.expectErroneousCode('var a: A, untyped;').to.throw(msg);
    t.expectErroneousCode('var untyped, b: B;').to.throw(msg);
    t.expectErroneousCode('var n: number, s: string;').to.throw(msg);
    t.expectErroneousCode('var untyped, n: number, s: string;').to.throw(msg);
  });

  it('supports const', () => {
    t.expectTranslate('const A = 1, B = 2;').to.equal(' const A = 1 , B = 2 ;');
    t.expectTranslate('const A: number = 1;').to.equal(' const num A = 1 ;');
  });
});

describe('classes', () => {
  it('should translate classes',
     () => { t.expectTranslate('class X {}').to.equal(' class X { }'); });
  it('should support extends',
     () => { t.expectTranslate('class X extends Y {}').to.equal(' class X extends Y { }'); });
  it('should support implements', () => {
    t.expectTranslate('class X implements Y, Z {}').to.equal(' class X implements Y , Z { }');
  });
  it('should support implements', () => {
    t.expectTranslate('class X extends Y implements Z {}')
        .to.equal(' class X extends Y implements Z { }');
  });

  describe('members', () => {
    it('supports fields', () => {
      t.expectTranslate('class X { x: number; y: string; }')
          .to.equal(' class X { num x ; String y ; }');
      t.expectTranslate('class X { x; }').to.equal(' class X { var x ; }');
    });
    it('supports field initializers', () => {
      t.expectTranslate('class X { x: number = 42; }').to.equal(' class X { num x = 42 ; }');
    });
    // TODO(martinprobst): Re-enable once Angular is migrated to TS.
    it.skip('supports visibility modifiers', () => {
      t.expectTranslate('class X { private _x; x; }').to.equal(' class X { var _x ; var x ; }');
      t.expectErroneousCode('class X { private x; }')
          .to.throw('private members must be prefixed with "_"');
      t.expectErroneousCode('class X { _x; }')
          .to.throw('public members must not be prefixed with "_"');
    });
    it.skip('does not support protected', () => {
      t.expectErroneousCode('class X { protected x; }')
          .to.throw('protected declarations are unsupported');
    });
    it('supports static fields', () => {
      t.expectTranslate('class X { static x: number = 42; }')
          .to.equal(' class X { static num x = 42 ; }');
    });
    it('supports methods', () => {
      t.expectTranslate('class X { x() { return 42; } }')
          .to.equal(' class X { x ( ) { return 42 ; } }');
    });
    it('supports method return types', () => {
      t.expectTranslate('class X { x(): number { return 42; } }')
          .to.equal(' class X { num x ( ) { return 42 ; } }');
    });
    it('supports method params', () => {
      t.expectTranslate('class X { x(a, b) { return 42; } }')
          .to.equal(' class X { x ( a , b ) { return 42 ; } }');
    });
    it('supports method return types', () => {
      t.expectTranslate('class X { x( a : number, b : string ) { return 42; } }')
          .to.equal(' class X { x ( num a , String b ) { return 42 ; } }');
    });
    it('supports get methods', () => {
      t.expectTranslate('class X { get y(): number {} }').to.equal(' class X { num get y { } }');
      t.expectTranslate('class X { static get Y(): number {} }')
          .to.equal(' class X { static num get Y { } }');
    });
    it('supports set methods', () => {
      t.expectTranslate('class X { set y(n: number) {} }')
          .to.equal(' class X { set y ( num n ) { } }');
      t.expectTranslate('class X { static get Y(): number {} }')
          .to.equal(' class X { static num get Y { } }');
    });
    it('supports constructors', () => {
      t.expectTranslate('class X { constructor() { } }').to.equal(' class X { X ( ) { } }');
    });
  });
});

describe('interfaces', () => {
  it('should translate interfaces',
     () => { t.expectTranslate('interface X {}').to.equal(' abstract class X { }'); });
  it('should support extends', () => {
    t.expectTranslate('interface X extends Y, Z {}')
        .to.equal(' abstract class X extends Y , Z { }');
  });
  it('should support implements', () => {
    t.expectTranslate('class X implements Y, Z {}').to.equal(' class X implements Y , Z { }');
  });
  it('should support implements', () => {
    t.expectTranslate('class X extends Y implements Z {}')
        .to.equal(' class X extends Y implements Z { }');
  });
  it('supports abstract methods', () => {
    t.expectTranslate('interface X { x(); }').to.equal(' abstract class X { abstract x ( ) ; }');
  });
});

describe('enums', () => {
  it('should support basic enum declaration', () => {
    t.expectTranslate('enum Color { Red, Green, Blue }')
        .to.equal(' enum Color { Red , Green , Blue }');
  });
  it('does not support empty enum',
     () => { t.expectErroneousCode('enum Empty { }').to.throw('empty enums are not supported'); });
  it('does not support enum with initializer', () => {
    t.expectErroneousCode('enum Color { Red = 1, Green, Blue = 4 }')
        .to.throw('enum initializers are not supported');
  });
  it('should support switch over enum', () => {
    t.expectTranslate('switch(c) { case Color.Red: break; default: break; }')
        .to.equal(' switch ( c ) { case Color . Red : break ; default : break ; }');
  });
  it('does not support const enum', () => {
    t.expectErroneousCode('const enum Color { Red }').to.throw('const enums are not supported');
  });
});
