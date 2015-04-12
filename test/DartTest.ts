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
