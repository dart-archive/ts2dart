/// <reference path="../typings/chai/chai.d.ts"/>
/// <reference path="../typings/mocha/mocha.d.ts"/>
/// <reference path="../typings/source-map/source-map.d.ts"/>
/// <reference path="../typings/source-map-support/source-map-support.d.ts"/>

require('source-map-support').install();

import chai = require('chai');
import main = require('../lib/main');
import SourceMap = require('source-map');
import ts = require('typescript');
import t = require('./test_support');

describe('transpile to dart', () => {
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

  describe('decorators', () => {
    it('translates plain decorators',
       () => { t.expectTranslate('@A class X {}').to.equal(' @ A class X { }'); });
    it('translates arguments',
       () => { t.expectTranslate('@A(a, b) class X {}').to.equal(' @ A ( a , b ) class X { }'); });
    it('translates const arguments', () => {
      t.expectTranslate('@A([1]) class X {}').to.equal(' @ A ( const [ 1 ] ) class X { }');
      t.expectTranslate('@A({"a": 1}) class X {}').to.equal(' @ A ( const { "a" : 1 } ) class X { }');
      t.expectTranslate('@A(new B()) class X {}').to.equal(' @ A ( const B ( ) ) class X { }');
    });
    it('translates on functions',
       () => { t.expectTranslate('@A function f() {}').to.equal(' @ A f ( ) { }'); });
    it('translates on properties',
       () => { t.expectTranslate('class X { @A p; }').to.equal(' class X { @ A var p ; }'); });
    it('translates on parameters',
       () => { t.expectTranslate('function f (@A p) {}').to.equal(' f ( @ A p ) { }'); });
    it('special cases @CONST', () => {
      t.expectTranslate('@CONST class X {}').to.equal(' @ CONST const class X { }');
      t.expectTranslate('@CONST() class X {}').to.equal(' @ CONST ( ) const class X { }');
      t.expectTranslate(`class X {
                        x: number;
                        y;
                        @CONST constructor() { super(3); this.x = 1; this.y = 2; }
                      }`)
          .to.equal(' class X {' +
                    ' final num x ; final y ;' +
                    ' @ CONST const X ( ) : x = 1 , y = 2 , super ( 3 ) ; }');
      t.expectTranslate('class X { @CONST constructor() {} }')
          .to.equal(' class X { @ CONST const X ( ) ; }');
      t.expectErroneousCode('class X { @CONST constructor() { if (1); } }')
          .to.throw('const constructors can only contain assignments and super calls');
      t.expectErroneousCode('class X { @CONST constructor() { f(); } }')
          .to.throw('const constructors can only contain assignments and super calls');
      t.expectErroneousCode('class X { @CONST constructor() { "string literal"; } }')
          .to.throw('const constructors can only contain assignments and super calls');
      t.expectErroneousCode('class X { @CONST constructor() { x = 1; } }')
          .to.throw('assignments in const constructors must assign into this.');
      t.expectErroneousCode('class X { @CONST constructor() { that.x = 1; } }')
          .to.throw('assignments in const constructors must assign into this.');
    });
    it('special cases @ABSTRACT', () => {
      t.expectTranslate('@ABSTRACT class X {}').to.equal(' @ ABSTRACT abstract class X { }');
    });
    it('special cases @IMPLEMENTS', () => {
      t.expectTranslate('@IMPLEMENTS(Y, Z) class X {}')
          .to.equal(' @ IMPLEMENTS ( Y , Z ) class X implements Y , Z { }');
      t.expectTranslate('@IMPLEMENTS(Z) class X extends Y {}')
          .to.equal(' @ IMPLEMENTS ( Z ) class X extends Y implements Z { }');
      t.expectTranslate('@IMPLEMENTS(Z) class X implements Y {}')
          .to.equal(' @ IMPLEMENTS ( Z ) class X implements Y , Z { }');
    });
  });

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
    it('does not support var args', () => {
      t.expectErroneousCode('function x(...a: number) { return 42; }')
          .to.throw('rest parameters are unsupported');
    });
    it('does not support generic functions', () => {
      t.expectErroneousCode('function x<T>() { return 42; }')
          .to.throw('generic functions are unsupported');
    });
    it('translates calls', () => {
      t.expectTranslate('foo();').to.equal(' foo ( ) ;');
      t.expectTranslate('foo(1, 2);').to.equal(' foo ( 1 , 2 ) ;');
    });
    it('translates new calls', () => {
      t.expectTranslate('new Foo();').to.equal(' new Foo ( ) ;');
      t.expectTranslate('new Foo(1, 2);').to.equal(' new Foo ( 1 , 2 ) ;');
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

  describe('control structures', () => {
    it('translates switch', () => {
      t.expectTranslate('switch(x) { case 1: break; case 2: break; default: break; }')
          .to.equal(' switch ( x ) { case 1 : break ; case 2 : break ; default : break ; }');
    });
    it('translates for loops', () => {
      t.expectTranslate('for (1; 2; 3) { 4 }').to.equal(' for ( 1 ; 2 ; 3 ) { 4 ; }');
      t.expectTranslate('for (var x = 1; 2; 3) { 4 }').to.equal(' for ( var x = 1 ; 2 ; 3 ) { 4 ; }');
      t.expectTranslate('for (var x, y = 1; 2; 3) { 4 }')
          .to.equal(' for ( var x , y = 1 ; 2 ; 3 ) { 4 ; }');
      t.expectTranslate('for (var x = 0, y = 1; 2; 3) { 4 }')
          .to.equal(' for ( var x = 0 , y = 1 ; 2 ; 3 ) { 4 ; }');
    });
    it('translates for-in loops', () => {
      t.expectTranslate('for (var x in 1) { 2 }').to.equal(' for ( var x in 1 ) { 2 ; }');
      t.expectTranslate('for (x in 1) { 2 }').to.equal(' for ( x in 1 ) { 2 ; }');
    });
    it('translates while loops', () => {
      t.expectTranslate('while (1) { 2 }').to.equal(' while ( 1 ) { 2 ; }');
      t.expectTranslate('do 1; while (2);').to.equal(' do 1 ; while ( 2 ) ;');
    });
    it('translates if/then/else', () => {
      t.expectTranslate('if (x) { 1 }').to.equal(' if ( x ) { 1 ; }');
      t.expectTranslate('if (x) { 1 } else { 2 }').to.equal(' if ( x ) { 1 ; } else { 2 ; }');
      t.expectTranslate('if (x) 1;').to.equal(' if ( x ) 1 ;');
      t.expectTranslate('if (x) 1; else 2;').to.equal(' if ( x ) 1 ; else 2 ;');
    });
    it('translates try/catch', () => {
      t.expectTranslate('try {} catch(e) {} finally {}')
          .to.equal(' try { } catch ( e ) { } finally { }');
      t.expectTranslate('try {} catch(e: MyException) {}')
          .to.equal(' try { } on MyException catch ( e ) { }');
    });
    it('translates throw', () => {
      t.expectTranslate('throw new Error("oops")').to.equal(' throw new Error ( "oops" ) ;');
    });
    it('translates empty statements', () => { t.expectTranslate(';').to.equal(' ;'); });
    it('translates break & continue', () => {
      t.expectTranslate('break;').to.equal(' break ;');
      t.expectTranslate('continue;').to.equal(' continue ;');
      t.expectTranslate('break foo ;').to.equal(' break foo ;');
    });
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

  describe('comments', () => {
    it('keeps leading comments', () => {
      t.expectTranslate('/* A */ a\n /* B */ b').to.equal(' /* A */ a ; /* B */ b ;');
      t.expectTranslate('// A\na\n// B\nb').to.equal(' // A\n a ; // B\n b ;');
    });
  });

  describe('imports', () => {
    it('translates import equals statements', () => {
      t.expectTranslate('import x = require("y");').to.equal(' import "package:y.dart" as x ;');
    });
    it('translates import from statements', () => {
      t.expectTranslate('import {x,y} from "z";').to.equal(' import "package:z.dart" show x , y ;');
    });
    it('translates import star', () => {
      t.expectTranslate('import * as foo from "z";').to.equal(' import "package:z.dart" as foo ;');
    });
    it('allows import dart file from relative path', () => {
      t.expectTranslate('import x = require("./y")').to.equal(' import "y.dart" as x ;');
      t.expectTranslate('import {x} from "./y"').to.equal(' import "y.dart" show x ;');
      t.expectTranslate('import {x} from "../y"').to.equal(' import "../y.dart" show x ;');
    });
    // TODO(martinprobst): Re-enable once moved to TypeScript.
    it.skip('handles ignored annotations in imports', () => {
      t.expectTranslate('import {CONST, IMPLEMENTS} from "x"').to.equal('');
      t.expectTranslate('import {x, IMPLEMENTS} from "./x"').to.equal(' import "x.dart" show x ;');
    });
  });

  describe('exports', () => {
    // Dart exports are implicit, everything non-private is exported by the library.
    it('allows variable exports',
       () => { t.expectTranslate('export var x = 12;').to.equal(' var x = 12 ;'); });
    it('allows class exports',
       () => { t.expectTranslate('export class X {}').to.equal(' class X { }'); });
    it('allows export declarations',
       () => { t.expectTranslate('export * from "X";').to.equal(' export "package:X.dart" ;'); });
    it('allows export declarations',
       () => { t.expectTranslate('export * from "./X";').to.equal(' export "X.dart" ;'); });
    it('allows named export declarations', () => {
      t.expectTranslate('export {a, b} from "X";').to.equal(' export "package:X.dart" show a , b ;');
    });
    it('fails for exports without URLs', () => {
      t.expectErroneousCode('export {a as b};').to.throw('re-exports must have a module URL');
    });
  });

  describe('errors', () => {
    it('reports multiple errors', () => {
      // Reports both the private field not having an underbar and protected being unsupported.
      var errorLines = new RegExp('delete operator is unsupported\n' +
                                  '.*void operator is unsupported');
      t.expectErroneousCode('delete x["y"]; void z;').to.throw(errorLines);
    });
    it('reports relative paths in errors', () => {
      var transpiler = new main.Transpiler({basePath: '/a'});
      var program = t.parseProgram('delete x["y"];', '/a/b/c.ts');
      chai.expect(() => transpiler.translateProgram(program)).to.throw(/^b\/c.ts:1/);
    });
  });

  describe('library name', () => {
    var transpiler;
    beforeEach(() => {
      transpiler = new main.Transpiler({failFast: true, generateLibraryName: true, basePath: '/a'});
    });
    it('adds a library name', () => {
      var program = t.parseProgram('var x;', '/a/b/c.ts');
      var res = transpiler.translateProgram(program);
      chai.expect(res).to.equal(' library b.c ; var x ;');
    });
    it('leaves relative paths alone',
       () => { chai.expect(transpiler.getLibraryName('a/b')).to.equal('a.b'); });
    it('handles reserved words', () => {
      chai.expect(transpiler.getLibraryName('/a/for/in/do/x')).to.equal('_for._in._do.x');
    });
    it('handles built-in and limited keywords', () => {
      chai.expect(transpiler.getLibraryName('/a/as/if/sync/x')).to.equal('as._if.sync.x');
    });
    it('handles file extensions', () => {
      chai.expect(transpiler.getLibraryName('a/x.ts')).to.equal('a.x');
      chai.expect(transpiler.getLibraryName('a/x.js')).to.equal('a.x');
    });
    it('handles non word characters',
       () => { chai.expect(transpiler.getLibraryName('a/%x.ts')).to.equal('a._x'); });
  });

  describe('output paths', () => {
    it('writes within the path', () => {
      var transpiler = new main.Transpiler({basePath: '/a'});
      chai.expect(transpiler.getOutputPath('/a/b/c.js', '/x')).to.equal('/x/b/c.dart');
      chai.expect(transpiler.getOutputPath('b/c.js', '/x')).to.equal('/x/b/c.dart');
      chai.expect(transpiler.getOutputPath('b/c.js', 'x')).to.equal('x/b/c.dart');
      chai.expect(() => transpiler.getOutputPath('/outside/b/c.js', '/x'))
          .to.throw(/must be located under base/);
    });
    it('defaults to writing to the same location', () => {
      var transpiler = new main.Transpiler({basePath: undefined});
      chai.expect(transpiler.getOutputPath('/a/b/c.js', '/e')).to.equal('/a/b/c.dart');
      chai.expect(transpiler.getOutputPath('b/c.js', '')).to.equal('b/c.dart');
    });
    it('translates .es6, .ts, and .js', () => {
      var transpiler = new main.Transpiler({basePath: undefined});
      ['a.js', 'a.ts', 'a.es6'].forEach(
          (n) => { chai.expect(transpiler.getOutputPath(n, '')).to.equal('a.dart'); });
    });
  });

  describe('source maps', () => {
    var transpiler: main.Transpiler;
    beforeEach(() => {
      transpiler = new main.Transpiler({generateSourceMap: true, basePath: '/absolute/'});
    });
    function translateMap(source) {
      var program = t.parseProgram(source, '/absolute/path/test.ts');
      return transpiler.translateProgram(program);
    }
    it('generates a source map', () => {
      chai.expect(translateMap('var x;'))
          .to.contain('//# sourceMappingURL=data:application/json;base64,');
    });
    it('maps locations', () => {
      var withMap = translateMap('var xVar: number;\nvar yVar: string;');
      chai.expect(withMap).to.contain(' num xVar ; String yVar ;');
      var b64string = withMap.match(/sourceMappingURL=data:application\/json;base64,(.*)/)[1];
      var mapString = new Buffer(b64string, 'base64').toString();
      var consumer = new SourceMap.SourceMapConsumer(JSON.parse(mapString));
      var expectedColumn = ' num xVar ; String yVar ;'.indexOf('yVar') + 1;
      var pos = consumer.originalPositionFor({line: 1, column: expectedColumn});
      chai.expect(pos).to.include({line: 2, column: 4});
      chai.expect(consumer.sourceContentFor('path/test.ts')).to.contain('yVar: string');
    });
  });
});
