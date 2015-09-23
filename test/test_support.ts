/// <reference path="../typings/chai/chai.d.ts"/>
/// <reference path="../typings/mocha/mocha.d.ts"/>
/// <reference path="../typings/node/node.d.ts"/>
import chai = require('chai');
import fs = require('fs');
import main = require('../lib/main');
import path = require('path');
import ts = require('typescript');

export type StringMap = { [k: string]: string };
export type Input = string | StringMap;

export function expectTranslate(tsCode: Input, options: main.TranspilerOptions = {}) {
  var result = translateSource(tsCode, options);
  return chai.expect(result);
}

export function expectErroneousCode(tsCode: Input, options: main.TranspilerOptions = {}) {
  options.failFast = false;  // Collect *all* errors.
  return chai.expect(() => translateSource(tsCode, options));
}

var compilerOptions = main.COMPILER_OPTIONS;
var defaultLibName = ts.getDefaultLibFileName(compilerOptions);
var libSource = fs.readFileSync(ts.getDefaultLibFilePath(compilerOptions), 'utf-8');
var libSourceFile: ts.SourceFile;

export function parseFiles(nameToContent: StringMap): ts.Program {
  var result: string;
  var compilerHost: ts.CompilerHost = {
    getSourceFile: function(sourceName, languageVersion) {
      if (nameToContent.hasOwnProperty(sourceName)) {
        return ts.createSourceFile(sourceName, nameToContent[sourceName], compilerOptions.target,
                                   true);
      }
      if (sourceName === defaultLibName) {
        if (!libSourceFile) {
          // Cache to avoid excessive test times.
          libSourceFile = ts.createSourceFile(sourceName, libSource, compilerOptions.target, true);
        }
        return libSourceFile;
      }
      return undefined;
    },
    writeFile: function(name, text, writeByteOrderMark) { result = text; },
    fileExists: (filename) => !!nameToContent[filename],
    readFile: (filename) => nameToContent[filename],
    getDefaultLibFileName: () => defaultLibName,
    useCaseSensitiveFileNames: () => false,
    getCanonicalFileName: (filename) => filename,
    getCurrentDirectory: () => '',
    getNewLine: () => '\n'
  };
  // Create a program from inputs
  var entryPoints = Object.keys(nameToContent);
  var program: ts.Program = ts.createProgram(entryPoints, compilerOptions, compilerHost);
  if (program.getSyntacticDiagnostics().length > 0) {
    // Throw first error.
    var first = program.getSyntacticDiagnostics()[0];
    throw new Error(`${first.start}: ${first.messageText} in ${nameToContent[entryPoints[0]]}`);
  }
  return program;
}

export function translateSources(contents: Input, options: main.TranspilerOptions = {}): StringMap {
  // Default to quick stack traces.
  if (!options.hasOwnProperty('failFast')) options.failFast = true;
  var namesToContent: StringMap;
  if (typeof contents === 'string') {
    namesToContent = {};
    namesToContent['main.ts'] = contents;
  } else {
    namesToContent = contents;
  }
  var transpiler = new main.Transpiler(options);
  var program = parseFiles(namesToContent);
  return transpiler.translateProgram(program);
}


export function translateSource(contents: Input, options: main.TranspilerOptions = {}): string {
  var results = translateSources(contents, options);
  // Return the main outcome, from 'main.ts'.
  return results['main.ts'];
}
