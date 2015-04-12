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

  describe('comments', () => {
    it('keeps leading comments', () => {
      t.expectTranslate('/* A */ a\n /* B */ b').to.equal(' /* A */ a ; /* B */ b ;');
      t.expectTranslate('// A\na\n// B\nb').to.equal(' // A\n a ; // B\n b ;');
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
