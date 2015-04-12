/// <reference path="../typings/mocha/mocha.d.ts"/>
import t = require('./test_support');

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
