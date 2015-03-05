import chai = require("chai");
import main = require("../main");
import ts = require("typescript");

describe('transpile to dart', function() {

  describe('variables', function() {
    it('should print variable declaration with initializer', function () {
      var result = translateSource("var a:number = 1;");
      chai.expect(result).to.equal(" num a = 1;\n");
    });
    it('should print variable declaration', function () {
      var result = translateSource("var a:number;");
      chai.expect(result).to.equal(" num a;\n");
    });
  });
});

export function translateSource(contents: string): string {
  var result: string;
  var compilerOptions: ts.CompilerOptions = { target: ts.ScriptTarget.ES6, module: ts.ModuleKind.AMD };
  var compilerHost: ts.CompilerHost = {
    getSourceFile: function (filename, languageVersion) {
      if (filename === "file.ts")
        return ts.createSourceFile(filename, contents, compilerOptions.target, "0");
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
  return main.translateProgram(program);
}
