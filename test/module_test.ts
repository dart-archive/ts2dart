/// <reference path="../typings/mocha/mocha.d.ts"/>
import chai = require('chai');
import main = require('../lib/main');

import {expectTranslate, expectErroneousCode, parseProgram} from './test_support';

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
  // TODO(martinprobst): Re-enable once moved to TypeScrip
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

describe('library name', () => {
  var transpiler;
  beforeEach(() => {
    transpiler = new main.Transpiler({failFast: true, generateLibraryName: true, basePath: '/a'});
  });
  it('adds a library name', () => {
    var program = parseProgram('var x;', '/a/b/c.ts');
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
