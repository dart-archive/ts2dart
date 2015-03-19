/// <reference path="../typings/chai/chai.d.ts"/>
/// <reference path="../typings/mocha/mocha.d.ts"/>
/// <reference path="../typings/source-map-support/source-map-support.d.ts"/>

import sms = require('source-map-support');
sms.install();

import chai = require('chai');
import main = require('../main');
import ts = require('typescript');

describe('transpile to dart', () => {

  function expectTranslate(tsCode: string) {
    var result = translateSource(tsCode);
    return chai.expect(result);
  }

  function expectTranslates(cases: any) {
    for (var tsCode in cases) {
      expectTranslate(tsCode).to.equal(cases[tsCode]);
    }
  }

  describe('variables', () => {
    it('should print variable declaration with initializer',
       () => { expectTranslate('var a:number = 1;').to.equal(' num a = 1 ;'); });
    it('should print variable declaration', () => {
      expectTranslate('var a:number;').to.equal(' num a ;');
      expectTranslate('var a;').to.equal(' var a ;');
    });
    it('should transpile variable declaration lists',
       () => { expectTranslate('var a: number, b: string;').to.equal(' num a ; String b ;'); });
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
    it('does not support empty enum', () => {
      chai.expect(() => translateSource('enum Empty { }'))
          .to.throw('empty enums are not supported');
    });
    it('does not support enum with initializer', () => {
      chai.expect(() => translateSource('enum Color { Red = 1, Green, Blue = 4 }'))
          .to.throw('enum initializers are not supported');
    });
    it('should support switch over enum', () => {
      expectTranslate('switch(c) { case Color.Red: break; default: break; }')
          .to.equal(' switch ( c ) { case Color . Red : break ; default : break ; }');
    });
  });

  describe('functions', () => {
    it('supports declarations',
       () => { expectTranslate('function x() {}').to.equal(' x ( ) { }'); });
    it('supports param default values', () => {
      expectTranslate('function x(a = 42) { return 42; }')
          .to.equal(' x ( [ a = 42 ] ) { return 42 ; }');
    });
    it('does not support var args', () => {
      chai.expect(() => translateSource('function x(...a: number) { return 42; }'))
          .to.throw('rest parameters are unsupported');
    });
    it('does not support generic functions', () => {
      chai.expect(() => translateSource('function x<T>() { return 42; }'))
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
    });
  });

  describe('literals', () => {
    it('translates string literals', () => {
      expectTranslate(`'hello\\' "world'`).to.equal(` "hello' \\"world" ;`);
      expectTranslate(`"hello\\" 'world"`).to.equal(` "hello\\" 'world" ;`);
    });

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
      expectTranslate('var x = {a: 1, b: 2}').to.equal(' var x = { a : 1 , b : 2 } ;');
      expectTranslate('var x = {a: 1, }').to.equal(' var x = { a : 1 } ;');
      expectTranslate('var x = {}').to.equal(' var x = { } ;');
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
      expectTranslate('try {} catch(e) {} finally {}').to.equal(' try { } catch ( e ) { } finally { }');
      expectTranslate('try {} catch(e: MyException) {}').to.equal(' try { } on MyException catch ( e ) { }');
    });
    it('translates throw', () => {
      expectTranslate('throw new Error("oops")').to.equal(' throw new Error ( "oops" ) ;');
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
        '1 === 2': ' 1 === 2 ;',
        '1 != 2': ' 1 != 2 ;',
        '1 !== 2': ' 1 !== 2 ;',
        '1 > 2': ' 1 > 2 ;',
        '1 < 2': ' 1 < 2 ;',
        '1 >= 2': ' 1 >= 2 ;',
        '1 <= 2': ' 1 <= 2 ;',
      });
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
    it('translates "delete"', () => {
      chai.expect(() => translateSource('delete x[y];')).to.throw('delete operator is unsupported');
    });
    it('translates "typeof"', () => {
      chai.expect(() => translateSource('typeof x;')).to.throw('typeof operator is unsupported');
    });
    it('translates "void"', () => {
      chai.expect(() => translateSource('void x;')).to.throw('void operator is unsupported');
    });
    it('translates "super()" constructor calls', () => {
      expectTranslate('class X { constructor() { super(1); } }')
          .to.equal(' class X { X ( ) : super ( 1 ) { /* super call moved to initializer */ ; } }');
      chai.expect(() => translateSource('class X { constructor() { if (y) super(1, 2); } }'))
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
    it('allows import dart file from relative path', () => {
      expectTranslate('import x = require("./y")').to.equal(' import "./y.dart" as x ;');
      expectTranslate('import {x} from "./y"').to.equal(' import "./y.dart" show x ;');
    });
  });

  describe('exports', () => {
    // Dart exports are implicit, everything non-private is exported by the library.
    it('allows variable exports', () => {
      expectTranslate('export var x = 12;').to.equal(' var x = 12 ;');
    });
    it('allows class exports', () => {
      expectTranslate('export class X {}').to.equal(' class X { }');
    });
    it('allows export declarations', () => {
      expectTranslate('export * from "X";').to.equal(' export "X" ;');
    });
  });
});

export function translateSource(contents: string): string {
  var result: string;
  var compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES6,
    module: ts.ModuleKind.AMD
  };
  var compilerHost: ts.CompilerHost = {
    getSourceFile: function(filename, languageVersion) {
      if (filename === 'file.ts')
        return ts.createSourceFile(filename, contents, compilerOptions.target, true);
      if (filename === 'lib.d.ts')
        return ts.createSourceFile(filename, '', compilerOptions.target, true);
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
  var program: ts.Program = ts.createProgram(['file.ts'], compilerOptions, compilerHost);
  if (program.getSyntacticDiagnostics().length > 0) {
    // Throw first error.
    var first = program.getSyntacticDiagnostics()[0];
    throw new Error(`${first.start}: ${first.messageText} in ${contents}`);
  }
  return main.translateProgram(program);
}
