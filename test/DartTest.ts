/// <reference path="../typings/chai/chai.d.ts"/>

import chai = require("chai");
import main = require("../main");
import ts = require("typescript");

describe('transpile to dart', function() {

  function expectTranslate(tsCode: string) {
    var result = translateSource(tsCode);
    return chai.expect(result);
  }

  describe('variables', function() {
    it('should print variable declaration with initializer', function() {
      expectTranslate("var a:number = 1;").to.equal(" num a = 1 ;\n");
    });
    it('should print variable declaration', function () {
      expectTranslate("var a:number;").to.equal(" num a ;\n");
    });
  });

  describe('classes', function() {
    it('should translate classes', function() {
      expectTranslate("class X {}").to.equal(" class X {\n }\n");
    })
    it('should support extends', function() {
      expectTranslate("class X extends Y {}").to.equal(" class X extends Y {\n }\n");
    })
  });
});

export function translateSource(contents: string): string {
  var result: string;
  var compilerOptions: ts.CompilerOptions = { target: ts.ScriptTarget.ES6, module: ts.ModuleKind.AMD };
  var compilerHost: ts.CompilerHost = {
    getSourceFile: function (filename, languageVersion) {
      if (filename === "file.ts")
        return ts.createSourceFile(filename, contents, compilerOptions.target, "0");
      if (filename === "lib.d.ts")
        return ts.createSourceFile(filename, '', compilerOptions.target, "0");
      return undefined;
    },
    writeFile: function (name, text, writeByteOrderMark) {
      result = text;
    },
    getDefaultLibFilename: function () { return "lib.d.ts"; },
    useCaseSensitiveFileNames: function () { return false; },
    getCanonicalFileName: function (filename) { return filename; },
    getCurrentDirectory: function () { return ""; },
    getNewLine: function () { return "\n"; }
  };
  // Create a program from inputs
  var program = ts.createProgram(["file.ts"], compilerOptions, compilerHost);
  if (program.getDiagnostics().length > 0) {
    // Throw first error.
    var first = program.getDiagnostics()[0];
    throw new Error(`${first.start}: ${first.messageText}`);
  }
  return main.translateProgram(program);
}
