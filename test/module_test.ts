/// <reference path="../typings/mocha/mocha.d.ts"/>
import chai = require('chai');
import main = require('../lib/main');
import ModuleTranspiler from '../lib/module';
import {FacadeConverter} from '../lib/facade_converter';

import {expectTranslate, expectErroneousCode, translateSources} from './test_support';

describe('imports', () => {
  it('translates import equals statements', () => {
    expectTranslate('import x = require("y");').to.equal('import "package:y.dart" as x;');
  });
  it('translates import from statements', () => {
    expectTranslate('import {x,y} from "z";').to.equal('import "package:z.dart" show x, y;');
  });
  it('translates import star', () => {
    expectTranslate('import * as foo from "z";').to.equal('import "package:z.dart" as foo;');
  });
  it('allows import dart file from relative path', () => {
    expectTranslate('import x = require("./y")').to.equal('import "y.dart" as x;');
    expectTranslate('import {x} from "./y"').to.equal('import "y.dart" show x;');
    expectTranslate('import {x} from "../y"').to.equal('import "../y.dart" show x;');
  });
  it('handles ignored annotations in imports', () => {
    expectTranslate('import {CONST, CONST_EXPR, IMPLEMENTS, ABSTRACT} from "x"').to.equal('');
    expectTranslate('import {x, IMPLEMENTS} from "./x"').to.equal('import "x.dart" show x;');
  });
  it('fails for renamed imports', () => {
    expectErroneousCode('import {Foo as Bar} from "baz";')
        .to.throw(/import\/export renames are unsupported in Dart/);
  });
  it('fails for empty import specs',
     () => { expectErroneousCode('import {} from "baz";').to.throw(/empty import list/); });
  it('translates angular/ references to angular2/', () => {
    expectTranslate(`import {foo} from '@angular/foo';`)
        .to.equal(`import "package:angular2/foo.dart" show foo;`);
  });
});

describe('exports', () => {
  // Dart exports are implicit, everything non-private is exported by the library.
  it('allows variable exports',
     () => { expectTranslate('export var x = 12;').to.equal('var x = 12;'); });
  it('allows class exports',
     () => { expectTranslate('export class X {}').to.equal('class X {}'); });
  it('allows export declarations',
     () => { expectTranslate('export * from "X";').to.equal('export "package:X.dart";'); });
  it('allows export declarations',
     () => { expectTranslate('export * from "./X";').to.equal('export "X.dart";'); });
  it('allows named export declarations', () => {
    expectTranslate('export {a, b} from "X";').to.equal('export "package:X.dart" show a, b;');
  });
  it('fails for renamed exports', () => {
    expectErroneousCode('export {Foo as Bar} from "baz";')
        .to.throw(/import\/export renames are unsupported in Dart/);
  });
  it('fails for exports without URLs', () => {
    expectErroneousCode('export {a as b};').to.throw('re-exports must have a module URL');
  });
  it('fails for empty export specs',
     () => { expectErroneousCode('export {} from "baz";').to.throw(/empty export list/); });
});

describe('library name', () => {
  let transpiler: main.Transpiler;
  let modTranspiler: ModuleTranspiler;
  beforeEach(() => {
    transpiler = new main.Transpiler({failFast: true, generateLibraryName: true, basePath: '/a'});
    modTranspiler = new ModuleTranspiler(transpiler, new FacadeConverter(transpiler), true);
  });
  it('adds a library name', () => {
    let results = translateSources(
        {'/a/b/c.ts': 'var x;'}, {failFast: true, generateLibraryName: true, basePath: '/a'});
    chai.expect(results['/a/b/c.ts']).to.equal(`library b.c;

var x;
`);
  });
  it('leaves relative paths alone',
     () => { chai.expect(modTranspiler.getLibraryName('a/b')).to.equal('a.b'); });
  it('strips leading @ signs',
     () => { chai.expect(modTranspiler.getLibraryName('@a/b')).to.equal('a.b'); });
  it('handles reserved words', () => {
    chai.expect(modTranspiler.getLibraryName('/a/for/in/do/x')).to.equal('_for._in._do.x');
  });
  it('handles built-in and limited keywords', () => {
    chai.expect(modTranspiler.getLibraryName('/a/as/if/sync/x')).to.equal('as._if.sync.x');
  });
  it('handles file extensions', () => {
    chai.expect(modTranspiler.getLibraryName('a/x.ts')).to.equal('a.x');
    chai.expect(modTranspiler.getLibraryName('a/x.js')).to.equal('a.x');
  });
  it('handles non word characters',
     () => { chai.expect(modTranspiler.getLibraryName('a/%x.ts')).to.equal('a._x'); });
});
