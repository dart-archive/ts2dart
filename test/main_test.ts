/// <reference path="../typings/chai/chai.d.ts"/>
/// <reference path="../typings/mocha/mocha.d.ts"/>
/// <reference path="../typings/source-map/source-map.d.ts"/>
import chai = require('chai');
import main = require('../lib/main');

import {expectTranslate, expectErroneousCode} from './test_support';

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
    it('removes @module doc tags', () => {
      expectTranslate(`/** @module
  * This is a module for doing X.
  */`).to.equal(`/** 
  * This is a module for doing X.
  */`);
    });
    it('removes @description doc tags', () => {
      expectTranslate(`/** @description
  * This is a module for doing X.
  */`).to.equal(`/** 
  * This is a module for doing X.
  */`);
    });
    it('removes @depracted doc tags', () => {
      expectTranslate(`/**
  * Use SomethingElse instead.
  * @deprecated
  */`).to.equal(`/**
  * Use SomethingElse instead.
  * 
  */`);
    });
    it('removes @param doc tags', () => {
      expectTranslate(`/**
  * Method to do blah.
  * @param doc Document.
  */`).to.equal(`/**
  * Method to do blah.
  * 
  */`);
    });
    it('removes @return doc tags', () => {
      expectTranslate(`/**
  * Method to do blah.
  * @return {String}
  */`).to.equal(`/**
  * Method to do blah.
  * 
  */`);
    });
    it('removes @throws doc tags', () => {
      expectTranslate(`/**
  * Method to do blah.
  * @throws ArgumentException If arguments are wrong
  */`).to.equal(`/**
  * Method to do blah.
  * 
  */`);
    });
  });

  describe('errors', () => {
    it('reports multiple errors', () => {
      // Reports both the private field not having an underbar and protected being unsupported.
      let errorLines = new RegExp(
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
      let transpiler = new main.Transpiler({basePath: '/a'});
      chai.expect(transpiler.getOutputPath('/a/b/c.js', '/x')).to.equal('/x/b/c.dart');
      chai.expect(transpiler.getOutputPath('b/c.js', '/x')).to.equal('/x/b/c.dart');
      chai.expect(transpiler.getOutputPath('b/c.js', 'x')).to.equal('x/b/c.dart');
      chai.expect(() => transpiler.getOutputPath('/outside/b/c.js', '/x'))
          .to.throw(/must be located under base/);
    });
    it('defaults to writing to the full path', () => {
      let transpiler = new main.Transpiler({basePath: undefined});
      chai.expect(transpiler.getOutputPath('/a/b/c.js', '/e')).to.equal('/e/a/b/c.dart');
      chai.expect(transpiler.getOutputPath('b/c.js', '')).to.equal('b/c.dart');
    });
    it('translates .es6, .ts, and .js', () => {
      let transpiler = new main.Transpiler({basePath: undefined});
      ['a.js', 'a.ts', 'a.es6'].forEach(
          (n) => { chai.expect(transpiler.getOutputPath(n, '')).to.equal('a.dart'); });
    });
  });
});
