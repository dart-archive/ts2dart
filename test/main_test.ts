/// <reference path="../typings/chai/chai.d.ts"/>
/// <reference path="../typings/mocha/mocha.d.ts"/>
/// <reference path="../typings/source-map/source-map.d.ts"/>
import SourceMap = require('source-map');
import chai = require('chai');
import main = require('../lib/main');
import ts = require('typescript');

import {expectTranslate, expectErroneousCode, translateSources} from './test_support';

describe('main transpiler functionality', () => {
  describe('comments', () => {
    it('keeps leading comments', () => {
      expectTranslate(`
function f() {
/* A */ a;
/* B */ b;
}`).to.equal(`f() {
  /* A */ a;
  /* B */ b;
}`);
      expectTranslate(`function f() {
// A
a
// B
b
}`).to.equal(`f() {
  // A
  a;
  // B
  b;
}`);
    });
    it('keeps ctor comments', () => {
      expectTranslate('/** A */ class A {\n /** ctor */ constructor() {}}').to.equal(`/** A */
class A {
  /** ctor */ A() {}
}`);
    });
    it('translates links to dart doc format', () => {
      expectTranslate('/** {@link this/place} */ a').to.equal('/** [this/place] */ a;');
      expectTranslate('/* {@link 1} {@link 2} */ a').to.equal('/* [1] [2] */ a;');
    });
  });

  describe('errors', () => {
    it('reports multiple errors', () => {
      // Reports both the private field not having an underbar and protected being unsupported.
      var errorLines = new RegExp(
          'delete operator is unsupported\n' +
          '.*void operator is unsupported');
      expectErroneousCode('delete x["y"]; void z;').to.throw(errorLines);
    });
    it('reports relative paths in errors', () => {
      chai.expect(() => expectTranslate({'/a/b/c.ts': 'delete x["y"];'}, {basePath: '/a'}))
          .to.throw(/^b\/c.ts:1/);
    });
    it('reports errors across multiple files', () => {
      expectErroneousCode({'a.ts': 'delete x["y"];', 'b.ts': 'delete x["y"];'}, {
        failFast: false
      }).to.throw(/^a\.ts.*\nb\.ts/);
    });
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
});
