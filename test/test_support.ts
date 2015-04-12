/// <reference path="../typings/chai/chai.d.ts"/>
/// <reference path="../typings/mocha/mocha.d.ts"/>
import main = require('../lib/main');
import chai = require('chai');
import ts = require('typescript');

export function expectTranslate(tsCode: string) {
  var result = translateSource(tsCode);
  return chai.expect(result);
}

export function expectErroneousCode(tsCode: string) {
  return chai.expect(() => translateSource(tsCode, false));
}

export function parseProgram(contents: string, fileName = 'file.ts'): ts.Program {
  var result: string;
  var compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES6,
    module: ts.ModuleKind.AMD
  };
  var compilerHost: ts.CompilerHost = {
    getSourceFile: function(sourceName, languageVersion) {
      if (sourceName === fileName) {
        return ts.createSourceFile(sourceName, contents, compilerOptions.target, true);
      }
      if (sourceName === 'lib.d.ts') {
        return ts.createSourceFile(sourceName, '', compilerOptions.target, true);
      }
      return undefined;
    },
    writeFile: function(name, text, writeByteOrderMark) { result = text; },
    getDefaultLibFileName: () => 'lib.d.ts',
    useCaseSensitiveFileNames: () => false,
    getCanonicalFileName: (filename) => filename,
    getCurrentDirectory: () => '',
    getNewLine: () => '\n'
  };
  // Create a program from inputs
  var program: ts.Program = ts.createProgram([fileName], compilerOptions, compilerHost);
  if (program.getSyntacticDiagnostics().length > 0) {
    // Throw first error.
    var first = program.getSyntacticDiagnostics()[0];
    throw new Error(`${first.start}: ${first.messageText} in ${contents}`);
  }
  return program;
}

export function translateSource(contents: string, failFast = true): string {
  var program = parseProgram(contents);
  var transpiler = new main.Transpiler({failFast});
  return transpiler.translateProgram(program);
}
