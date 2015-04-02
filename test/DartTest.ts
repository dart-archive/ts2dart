/// <reference path="../typings/chai/chai.d.ts"/>
/// <reference path="../typings/mocha/mocha.d.ts"/>
/// <reference path="../typings/source-map-support/source-map-support.d.ts"/>

import sms = require('source-map-support');
sms.install();

import chai = require('chai');
import main = require('../lib/main');
import ts = require('typescript');

describe('transpile to dart', () => {

  function expectTranslate(tsCode: string) {
    var result = translateSource(tsCode);
    return chai.expect(result);
  }

  function expectErroneousCode(tsCode: string) {
    return chai.expect(() => translateSource(tsCode, false));
  }

  function expectTranslates(cases: any) {
    for (var tsCode in cases) {
      expectTranslate(tsCode).to.equal(cases[tsCode]);
    }
  }

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
    });
  });

  describe('variables', () => {
    it('should print variable declaration with initializer',
       () => { expectTranslate('var a:number = 1;').to.equal(' num a = 1 ;'); });
    it('should print variable declaration', () => {
      expectTranslate('var a:number;').to.equal(' num a ;');
      expectTranslate('var a;').to.equal(' var a ;');
      expectTranslate('var a:any;').to.equal(' dynamic a ;');
    });
    it('should transpile variable declaration lists', () => {
      expectTranslate('var a: A;').to.equal(' A a ;');
      expectTranslate('var a, b;').to.equal(' var a , b ;');
    });
    it('should transpile variable declaration lists with initializers', () => {
      expectTranslate('var a = 0;').to.equal(' var a = 0 ;');
      expectTranslate('var a, b = 0;').to.equal(' var a , b = 0 ;');
      expectTranslate('var a = 1, b = 0;').to.equal(' var a = 1 , b = 0 ;');
    });
    it('does not support vardecls containing more than one type (implicit or explicit)', () => {
      var msg = 'Variables in a declaration list of more than one variable cannot by typed';
      expectErroneousCode('var a: A, untyped;').to.throw(msg);
      expectErroneousCode('var untyped, b: B;').to.throw(msg);
      expectErroneousCode('var n: number, s: string;').to.throw(msg);
      expectErroneousCode('var untyped, n: number, s: string;').to.throw(msg);
    });

    it('supports const', () => {
      expectTranslate('const A = 1, B = 2;').to.equal(' const A = 1 , B = 2 ;');
      expectTranslate('const A: number = 1;').to.equal(' const num A = 1 ;');
    });
  });

  describe('classes', () => {
    it('should translate classes',
       () => { expectTranslate('class X {}').to.equal(' class X { }'); });
    it('should support extends',
       () => { expectTranslate('class X extends Y {}').to.equal(' class X extends Y { }'); });
    it('should support implements', () => {
      expectTranslate('class X implements Y, Z {}').to.equal(' class X implements Y , Z { }');
    });
    it('should support implements', () => {
      expectTranslate('class X extends Y implements Z {}')
          .to.equal(' class X extends Y implements Z { }');
    });

    describe('type arguments', () => {
      it('should support declaration', () => {
        expectTranslate('class X<A, B> { a: A; }').to.equal(' class X < A , B > { A a ; }');
      });
      it('should support declaration', () => {
        expectTranslate('class X<A extends B<C>> { }')
            .to.equal(' class X < A extends B < C > > { }');
      });
      it('should support declaration', () => {
        expectTranslate('class X<A extends A1, B extends B1> { }')
            .to.equal(' class X < A extends A1 , B extends B1 > { }');
      });
      it('should support use', () => {
        expectTranslate('class X extends Y<A, B> { }').to.equal(' class X extends Y < A , B > { }');
      });
    });

    describe('members', () => {
      it('supports fields', () => {
        expectTranslate('class X { x: number; y: string; }')
            .to.equal(' class X { num x ; String y ; }');
        expectTranslate('class X { x; }').to.equal(' class X { var x ; }');
      });
      it('supports field initializers', () => {
        expectTranslate('class X { x: number = 42; }').to.equal(' class X { num x = 42 ; }');
      });
      // TODO(martinprobst): Re-enable once Angular is migrated to TS.
      it.skip('supports visibility modifiers', () => {
        expectTranslate('class X { private _x; x; }').to.equal(' class X { var _x ; var x ; }');
        expectErroneousCode('class X { private x; }')
            .to.throw('private members must be prefixed with "_"');
        expectErroneousCode('class X { _x; }')
            .to.throw('public members must not be prefixed with "_"');
      });
      it.skip('does not support protected', () => {
        expectErroneousCode('class X { protected x; }')
            .to.throw('protected declarations are unsupported');
      });
      it('supports static fields', () => {
        expectTranslate('class X { static x: number = 42; }')
            .to.equal(' class X { static num x = 42 ; }');
      });
      it('supports methods', () => {
        expectTranslate('class X { x() { return 42; } }')
            .to.equal(' class X { x ( ) { return 42 ; } }');
      });
      it('supports method return types', () => {
        expectTranslate('class X { x(): number { return 42; } }')
            .to.equal(' class X { num x ( ) { return 42 ; } }');
      });
      it('supports method params', () => {
        expectTranslate('class X { x(a, b) { return 42; } }')
            .to.equal(' class X { x ( a , b ) { return 42 ; } }');
      });
      it('supports method return types', () => {
        expectTranslate('class X { x( a : number, b : string ) { return 42; } }')
            .to.equal(' class X { x ( num a , String b ) { return 42 ; } }');
      });
      it('supports get methods', () => {
        expectTranslate('class X { get y(): number {} }').to.equal(' class X { num get y { } }');
        expectTranslate('class X { static get Y(): number {} }')
            .to.equal(' class X { static num get Y { } }');
      });
      it('supports set methods', () => {
        expectTranslate('class X { set y(n: number) {} }')
            .to.equal(' class X { set y ( num n ) { } }');
        expectTranslate('class X { static get Y(): number {} }')
            .to.equal(' class X { static num get Y { } }');
      });
      it('supports constructors', () => {
        expectTranslate('class X { constructor() { } }').to.equal(' class X { X ( ) { } }');
      });
    });
  });

  describe('interfaces', () => {
    it('should translate interfaces',
       () => { expectTranslate('interface X {}').to.equal(' abstract class X { }'); });
    it('should support extends', () => {
      expectTranslate('interface X extends Y, Z {}')
          .to.equal(' abstract class X extends Y , Z { }');
    });
    it('should support implements', () => {
      expectTranslate('class X implements Y, Z {}').to.equal(' class X implements Y , Z { }');
    });
    it('should support implements', () => {
      expectTranslate('class X extends Y implements Z {}')
          .to.equal(' class X extends Y implements Z { }');
    });
    it('supports abstract methods', () => {
      expectTranslate('interface X { x(); }').to.equal(' abstract class X { abstract x ( ) ; }');
    });
  });

  describe('enums', () => {
    it('should support basic enum declaration', () => {
      expectTranslate('enum Color { Red, Green, Blue }')
          .to.equal(' enum Color { Red , Green , Blue }');
    });
    it('does not support empty enum',
       () => { expectErroneousCode('enum Empty { }').to.throw('empty enums are not supported'); });
    it('does not support enum with initializer', () => {
      expectErroneousCode('enum Color { Red = 1, Green, Blue = 4 }')
          .to.throw('enum initializers are not supported');
    });
    it('should support switch over enum', () => {
      expectTranslate('switch(c) { case Color.Red: break; default: break; }')
          .to.equal(' switch ( c ) { case Color . Red : break ; default : break ; }');
    });
    it('does not support const enum', () => {
      expectErroneousCode('const enum Color { Red }').to.throw('const enums are not supported');
    });
  });

  describe('decorators', () => {
    it('translates plain decorators',
       () => { expectTranslate('@A class X {}').to.equal(' @ A class X { }'); });
    it('translates arguments',
       () => { expectTranslate('@A(a, b) class X {}').to.equal(' @ A ( a , b ) class X { }'); });
    it('translates const arguments', () => {
      expectTranslate('@A([1]) class X {}').to.equal(' @ A ( const [ 1 ] ) class X { }');
      expectTranslate('@A({"a": 1}) class X {}').to.equal(' @ A ( const { "a" : 1 } ) class X { }');
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
      expectErroneousCode('class X { @CONST constructor() { that.x = 1; } }')
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

  describe('functions', () => {
    it('supports declarations',
       () => { expectTranslate('function x() {}').to.equal(' x ( ) { }'); });
    it('supports param default values', () => {
      expectTranslate('function x(a = 42, b = 1) { return 42; }')
          .to.equal(' x ( [ a = 42 , b = 1 ] ) { return 42 ; }');
      expectTranslate('function x(p1, a = 42, b = 1, p2) { return 42; }')
          .to.equal(' x ( p1 , [ a = 42 , b = 1 , p2 ] ) { return 42 ; }');
    });
    it('supports empty returns',
       () => { expectTranslate('function x() { return; }').to.equal(' x ( ) { return ; }'); });
    it('supports named parameters', () => {
      expectTranslate('function x({a = "x", b}) { return a + b; }')
          .to.equal(' x ( { a : "x" , b } ) { return a + b ; }');
    });
    // TODO(martinprobst): Support types on named parameters.
    it.skip('fails for types on named parameters', () => {
      expectErroneousCode('function x({a}: number) { return a + b; }')
          .to.throw('types on named parameters are unsupported');
    });
    it('translates destructuring parameters', () => {
      expectTranslate('function x({p = null, d = false} = {}) {}')
          .to.equal(' x ( { p : null , d : false } ) { }');
      expectErroneousCode('function x({a=false}={a:true})')
          .to.throw('initializers for named parameters must be empty object literals');
      expectErroneousCode('function x({a=false}=true)')
          .to.throw('initializers for named parameters must be empty object literals');
      expectTranslate('class X { constructor() { super({p: 1}); } }')
          .to.equal(' class X { X ( ) : super ( p : 1 ) {' +
                    ' /* super call moved to initializer */ ; } }');
    });
    it('hacks last object literal parameters into named parameter', () => {
      expectTranslate('f(x, {a: 12, b: 4});').to.equal(' f ( x , a : 12 , b : 4 ) ;');
      expectTranslate('f({a: 12});').to.equal(' f ( a : 12 ) ;');
      expectTranslate('f({"a": 12});').to.equal(' f ( { "a" : 12 } ) ;');
      expectTranslate('new X(x, {a: 12, b: 4});').to.equal(' new X ( x , a : 12 , b : 4 ) ;');
      expectTranslate('f(x, {});').to.equal(' f ( x , { } ) ;');
    });
    it('does not support var args', () => {
      expectErroneousCode('function x(...a: number) { return 42; }')
          .to.throw('rest parameters are unsupported');
    });
    it('does not support generic functions', () => {
      expectErroneousCode('function x<T>() { return 42; }')
          .to.throw('generic functions are unsupported');
    });
    it('translates calls', () => {
      expectTranslate('foo();').to.equal(' foo ( ) ;');
      expectTranslate('foo(1, 2);').to.equal(' foo ( 1 , 2 ) ;');
    });
    it('translates new calls', () => {
      expectTranslate('new Foo();').to.equal(' new Foo ( ) ;');
      expectTranslate('new Foo(1, 2);').to.equal(' new Foo ( 1 , 2 ) ;');
    });
    it('translates function expressions',
       () => { expectTranslate('var a = function() {}').to.equal(' var a = ( ) { } ;'); });
    it('translates fat arrow operator', () => {
      expectTranslate('var a = () => {}').to.equal(' var a = ( ) { } ;');
      expectTranslate('var a = (p) => isBlank(p)').to.equal(' var a = ( p ) => isBlank ( p ) ;');
      expectTranslate('var a = (p = null) => isBlank(p)')
          .to.equal(' var a = ( [ p = null ] ) => isBlank ( p ) ;');
    });
  });

  describe('literals', () => {
    it('translates string literals', () => {
      expectTranslate(`'hello\\' "world'`).to.equal(` "hello' \\"world" ;`);
      expectTranslate(`"hello\\" 'world"`).to.equal(` "hello\\" 'world" ;`);
    });

    it('translates string templates', () => {
      expectTranslate("`hello \nworld`").to.equal(" '''hello \nworld''' ;");
      expectTranslate("`hello ${world}`").to.equal(" '''hello ${ world}''' ;");
      expectTranslate("`${a}$b${$c}`").to.equal(" '''${ a}\\$b${ $c}''' ;");
      expectTranslate("`'${a}'`").to.equal(" '''\\'${ a}\\'''' ;");
      expectTranslate("`'a'`").to.equal(" '''\\'a\\'''' ;");
      // https://github.com/angular/angular/issues/509
      expectTranslate('"${a}"').to.equal(' "\\${a}" ;');
      expectTranslate('"\\${a}"').to.equal(' "\\${a}" ;');
      expectTranslate("'\\${a}'").to.equal(' "\\${a}" ;');
      expectTranslate("'$a'").to.equal(' "\\$a" ;');
      expectTranslate("`$a`").to.equal(" '''\\$a''' ;");
      expectTranslate("`\\$a`").to.equal(" '''\\$a''' ;");
    });

    it('escapes escape sequences',
       () => { expectTranslate("`\\\\u1234`").to.equal(" '''\\\\u1234''' ;"); });

    it('translates boolean literals', () => {
      expectTranslate('true').to.equal(' true ;');
      expectTranslate('false').to.equal(' false ;');
      expectTranslate('var b:boolean = true;').to.equal(' bool b = true ;');
    });

    it('translates the null literal', () => { expectTranslate('null').to.equal(' null ;'); });

    it('translates number literals', () => {
      // Negative numbers are handled by unary minus expressions.
      expectTranslate('1234').to.equal(' 1234 ;');
      expectTranslate('12.34').to.equal(' 12.34 ;');
      expectTranslate('1.23e-4').to.equal(' 1.23e-4 ;');
    });

    it('translates regexp literals',
       () => { expectTranslate('/wo\\/t?/').to.equal(' /wo\\/t?/ ;'); });

    it('translates array literals', () => {
      expectTranslate('[1,2]').to.equal(' [ 1 , 2 ] ;');
      expectTranslate('[1,]').to.equal(' [ 1 ] ;');
      expectTranslate('[]').to.equal(' [ ] ;');
    });

    it('translates object literals', () => {
      expectTranslate('var x = {a: 1, b: 2}').to.equal(' var x = { "a" : 1 , "b" : 2 } ;');
      expectTranslate('var x = {a: 1, }').to.equal(' var x = { "a" : 1 } ;');
      expectTranslate('var x = {}').to.equal(' var x = { } ;');
      expectTranslate('var x = {y}').to.equal(' var x = { "y" : y } ;');
    });
  });

  describe('control structures', () => {
    it('translates switch', () => {
      expectTranslate('switch(x) { case 1: break; case 2: break; default: break; }')
          .to.equal(' switch ( x ) { case 1 : break ; case 2 : break ; default : break ; }');
    });
    it('translates for loops', () => {
      expectTranslate('for (1; 2; 3) { 4 }').to.equal(' for ( 1 ; 2 ; 3 ) { 4 ; }');
      expectTranslate('for (var x = 1; 2; 3) { 4 }').to.equal(' for ( var x = 1 ; 2 ; 3 ) { 4 ; }');
      expectTranslate('for (var x, y = 1; 2; 3) { 4 }')
          .to.equal(' for ( var x , y = 1 ; 2 ; 3 ) { 4 ; }');
      expectTranslate('for (var x = 0, y = 1; 2; 3) { 4 }')
          .to.equal(' for ( var x = 0 , y = 1 ; 2 ; 3 ) { 4 ; }');
    });
    it('translates for-in loops', () => {
      expectTranslate('for (var x in 1) { 2 }').to.equal(' for ( var x in 1 ) { 2 ; }');
      expectTranslate('for (x in 1) { 2 }').to.equal(' for ( x in 1 ) { 2 ; }');
    });
    it('translates while loops', () => {
      expectTranslate('while (1) { 2 }').to.equal(' while ( 1 ) { 2 ; }');
      expectTranslate('do 1; while (2);').to.equal(' do 1 ; while ( 2 ) ;');
    });
    it('translates if/then/else', () => {
      expectTranslate('if (x) { 1 }').to.equal(' if ( x ) { 1 ; }');
      expectTranslate('if (x) { 1 } else { 2 }').to.equal(' if ( x ) { 1 ; } else { 2 ; }');
      expectTranslate('if (x) 1;').to.equal(' if ( x ) 1 ;');
      expectTranslate('if (x) 1; else 2;').to.equal(' if ( x ) 1 ; else 2 ;');
    });
    it('translates try/catch', () => {
      expectTranslate('try {} catch(e) {} finally {}')
          .to.equal(' try { } catch ( e ) { } finally { }');
      expectTranslate('try {} catch(e: MyException) {}')
          .to.equal(' try { } on MyException catch ( e ) { }');
    });
    it('translates throw', () => {
      expectTranslate('throw new Error("oops")').to.equal(' throw new Error ( "oops" ) ;');
    });
    it('translates empty statements', () => { expectTranslate(';').to.equal(' ;'); });
    it('translates break & continue', () => {
      expectTranslate('break;').to.equal(' break ;');
      expectTranslate('continue;').to.equal(' continue ;');
      expectTranslate('break foo ;').to.equal(' break foo ;');
    });
  });

  describe('property expressions', () => {
    it('translates property paths', () => {
      expectTranslate('foo.bar;').to.equal(' foo . bar ;');
      expectTranslate('foo[bar];').to.equal(' foo [ bar ] ;');
    });
  });

  describe('basic expressions', () => {
    it('does math', () => {
      expectTranslates({
        '1 + 2': ' 1 + 2 ;',
        '1 - 2': ' 1 - 2 ;',
        '1 * 2': ' 1 * 2 ;',
        '1 / 2': ' 1 / 2 ;',
        '1 % 2': ' 1 % 2 ;',
        'x++': ' x ++ ;',
        'x--': ' x -- ;',
        '++x': ' ++ x ;',
        '--x': ' -- x ;',
        '-x': ' - x ;',
      });
    });
    it('assigns', () => {
      expectTranslates({
        'x += 1': ' x += 1 ;',
        'x -= 1': ' x -= 1 ;',
        'x *= 1': ' x *= 1 ;',
        'x /= 1': ' x /= 1 ;',
        'x %= 1': ' x %= 1 ;',
        'x <<= 1': ' x <<= 1 ;',
        'x >>= 1': ' x >>= 1 ;',
        'x >>>= 1': ' x >>>= 1 ;',
        'x &= 1': ' x &= 1 ;',
        'x ^= 1': ' x ^= 1 ;',
        'x |= 1': ' x |= 1 ;',
      });
    });
    it('compares', () => {
      expectTranslates({
        '1 == 2': ' 1 == 2 ;',
        '1 != 2': ' 1 != 2 ;',
        '1 > 2': ' 1 > 2 ;',
        '1 < 2': ' 1 < 2 ;',
        '1 >= 2': ' 1 >= 2 ;',
        '1 <= 2': ' 1 <= 2 ;',
      });
    });
    it('compares identity', () => {
      expectTranslate('1 === 2').to.equal(' identical ( 1 , 2 ) ;');
      expectTranslate('1 !== 2').to.equal(' ! identical ( 1 , 2 ) ;');
    });
    it('bit fiddles', () => {
      expectTranslates({
        '1 & 2': ' 1 & 2 ;',
        '1 | 2': ' 1 | 2 ;',
        '1 ^ 2': ' 1 ^ 2 ;',
        '~ 1': ' ~ 1 ;',
        '1 << 2': ' 1 << 2 ;',
        '1 >> 2': ' 1 >> 2 ;',
        '1 >>> 2': ' 1 >>> 2 ;',
      });
    });
    it('translates logic', () => {
      expectTranslates({
        '1 && 2': ' 1 && 2 ;',
        '1 || 2': ' 1 || 2 ;',
        '!1': ' ! 1 ;',
      });
    });
    it('translates ternary', () => { expectTranslate('1 ? 2 : 3').to.equal(' 1 ? 2 : 3 ;'); });
    it('translates the comma operator', () => { expectTranslate('1 , 2').to.equal(' 1 , 2 ;'); });
    it('translates "in"', () => { expectTranslate('1 in 2').to.equal(' 1 in 2 ;'); });
    it('translates "instanceof"',
       () => { expectTranslate('1 instanceof 2').to.equal(' 1 is 2 ;'); });
    it('translates "this"', () => { expectTranslate('this.x').to.equal(' this . x ;'); });
    it('translates "delete"',
       () => { expectErroneousCode('delete x[y];').to.throw('delete operator is unsupported'); });
    it('translates "typeof"',
       () => { expectErroneousCode('typeof x;').to.throw('typeof operator is unsupported'); });
    it('translates "void"',
       () => { expectErroneousCode('void x;').to.throw('void operator is unsupported'); });
    it('translates "super()" constructor calls', () => {
      expectTranslate('class X { constructor() { super(1); } }')
          .to.equal(' class X { X ( ) : super ( 1 ) { /* super call moved to initializer */ ; } }');
      expectErroneousCode('class X { constructor() { if (y) super(1, 2); } }')
          .to.throw('super calls must be immediate children of their constructors');
      expectTranslate('class X { constructor() { a(); super(1); b(); } }')
          .to.equal(' class X { X ( ) : super ( 1 ) {' +
                    ' a ( ) ; /* super call moved to initializer */ ; b ( ) ;' +
                    ' } }');
    });
    it('translates "super.x()" super method calls', () => {
      expectTranslate('class X { y() { super.z(1); } }')
          .to.equal(' class X { y ( ) { super . z ( 1 ) ; } }');
    });
  });

  describe('expressions', () => {
    it('translates parens', () => { expectTranslate('(1)').to.equal(' ( 1 ) ;'); });
  });

  describe('comments', () => {
    it('keeps leading comments', () => {
      expectTranslate('/* A */ a\n /* B */ b').to.equal(' /* A */ a ; /* B */ b ;');
      expectTranslate('// A\na\n// B\nb').to.equal(' // A\n a ; // B\n b ;');
    });
  });

  describe('imports', () => {
    it('translates import equals statements', () => {
      expectTranslate('import x = require("y");').to.equal(' import "package:y.dart" as x ;');
    });
    it('translates import from statements', () => {
      expectTranslate('import {x,y} from "z";').to.equal(' import "package:z.dart" show x , y ;');
    });
    it('translates import star', () => {
      expectTranslate('import * as foo from "z";').to.equal(' import "package:z.dart" as foo ;');
    });
    it('allows import dart file from relative path', () => {
      expectTranslate('import x = require("./y")').to.equal(' import "y.dart" as x ;');
      expectTranslate('import {x} from "./y"').to.equal(' import "y.dart" show x ;');
      expectTranslate('import {x} from "../y"').to.equal(' import "../y.dart" show x ;');
    });
    // TODO(martinprobst): Re-enable once moved to TypeScript.
    it.skip('handles ignored annotations in imports', () => {
      expectTranslate('import {CONST, IMPLEMENTS} from "x"').to.equal('');
      expectTranslate('import {x, IMPLEMENTS} from "./x"').to.equal(' import "x.dart" show x ;');
    });
  });

  describe('exports', () => {
    // Dart exports are implicit, everything non-private is exported by the library.
    it('allows variable exports',
       () => { expectTranslate('export var x = 12;').to.equal(' var x = 12 ;'); });
    it('allows class exports',
       () => { expectTranslate('export class X {}').to.equal(' class X { }'); });
    it('allows export declarations',
       () => { expectTranslate('export * from "X";').to.equal(' export "package:X.dart" ;'); });
    it('allows export declarations',
       () => { expectTranslate('export * from "./X";').to.equal(' export "X.dart" ;'); });
    it('allows named export declarations', () => {
      expectTranslate('export {a, b} from "X";').to.equal(' export "package:X.dart" show a , b ;');
    });
    it('fails for exports without URLs', () => {
      expectErroneousCode('export {a as b};').to.throw('re-exports must have a module URL');
    });
  });

  describe('errors', () => {
    it('reports multiple errors', () => {
      // Reports both the private field not having an underbar and protected being unsupported.
      var errorLines = new RegExp('delete operator is unsupported\n' +
                                  '.*void operator is unsupported');
      expectErroneousCode('delete x["y"]; void z;').to.throw(errorLines);
    });
  });

  describe('library name', () => {
    var transpiler;
    beforeEach(() => transpiler = new main.Transpiler(true, /* generateLibraryName */ true));
    it('adds a library name', () => {
      var program = parseProgram('var x;', '/a/b/c.ts');
      var res = transpiler.translateProgram(program, 'a/b/c.ts');
      chai.expect(res).to.equal(' library a.b.c ; var x ;');
    });
    it('handles keywords', () => {
      chai.expect(transpiler.getLibraryName('/a/for/in/do/x')).to.equal('a._for._in._do.x');
    });
    it('handles file extensions', () => {
      chai.expect(transpiler.getLibraryName('a/x.ts')).to.equal('a.x');
      chai.expect(transpiler.getLibraryName('a/x.js')).to.equal('a.x');
    });
    it('handles non word characters',
       () => { chai.expect(transpiler.getLibraryName('a/%x.ts')).to.equal('a._x'); });
  });
});

function parseProgram(contents: string, fileName = 'file.ts'): ts.Program {
  var result: string;
  var compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES6,
    module: ts.ModuleKind.AMD
  };
  var compilerHost: ts.CompilerHost = {
    getSourceFile: function(sourceName, languageVersion) {
      if (sourceName === fileName) {
        return ts.createSourceFile(sourceName, contents, compilerOptions.target, true);
      }
      if (sourceName === 'lib.d.ts') {
        return ts.createSourceFile(sourceName, '', compilerOptions.target, true);
      }
      return undefined;
    },
    writeFile: function(name, text, writeByteOrderMark) { result = text; },
    getDefaultLibFileName: () => 'lib.d.ts',
    useCaseSensitiveFileNames: () => false,
    getCanonicalFileName: (filename) => filename,
    getCurrentDirectory: () => '',
    getNewLine: () => '\n'
  };
  // Create a program from inputs
  var program: ts.Program = ts.createProgram([fileName], compilerOptions, compilerHost);
  if (program.getSyntacticDiagnostics().length > 0) {
    // Throw first error.
    var first = program.getSyntacticDiagnostics()[0];
    throw new Error(`${first.start}: ${first.messageText} in ${contents}`);
  }
  return program;
}

function translateSource(contents: string, failFast = true): string {
  var program = parseProgram(contents);
  var transpiler = new main.Transpiler(failFast, /* generateLibraryName */ false);
  return transpiler.translateProgram(program, null);
}
