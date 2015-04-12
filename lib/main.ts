/// <reference path='../typings/fs-extra/fs-extra.d.ts' />
/// <reference path='../typings/node/node.d.ts' />
/// <reference path='../typings/source-map/source-map.d.ts' />
// Use HEAD version of typescript, installed by npm
/// <reference path='../node_modules/typescript/bin/typescript.d.ts' />
require('source-map-support').install();
import SourceMap = require('source-map');
import fs = require('fs');
import fsx = require('fs-extra');
import path = require('path');
import ts = require('typescript');

import base = require('./base');
import CallTranspiler = require('./call');
import DeclarationTranspiler = require('./declaration');
import ExpressionTranspiler = require('./expression');
import ModuleTranspiler = require('./module');
import StatementTranspiler = require('./statement');
import TypeTranspiler = require('./type');
import LiteralTranspiler = require('./literal');

export interface TranspilerOptions {
  // Fail on the first error, do not collect multiple. Allows easier debugging as stack traces lead
  // directly to the offending line.
  failFast?: boolean;
  // Whether to generate 'library a.b.c;' names from relative file paths.
  generateLibraryName?: boolean;
  // Whether to generate source maps.
  generateSourceMap?: boolean;
  // A base path to relativize absolute file paths against. This is useful for library name
  // generation (see above) and nicer file names in error messages.
  basePath?: string;
}

export class Transpiler {
  private output: Output;
  private currentFile: ts.SourceFile;

  // Comments attach to all following AST nodes before the next 'physical' token. Track the earliest
  // offset to avoid printing comments multiple times.
  private lastCommentIdx: number = -1;
  private errors: string[] = [];

  private transpilers: base.TranspilerStep[];

  constructor(private options: TranspilerOptions = {}) {
    this.transpilers = [
      new CallTranspiler(this),  // Has to come before StatementTranspiler!
      new DeclarationTranspiler(this),
      new ExpressionTranspiler(this),
      new LiteralTranspiler(this),
      new ModuleTranspiler(this, options.generateLibraryName),
      new StatementTranspiler(this),
      new TypeTranspiler(this),
    ];
  }

  private static OPTIONS: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES6,
    module: ts.ModuleKind.CommonJS,
    allowNonTsExtensions: true,
  };

  /**
   * Transpiles the given files to Dart.
   * @param fileNames The input files.
   * @param destination Location to write files to. Creates files next to their sources if absent.
   */
  transpile(fileNames: string[], destination?: string): void {
    var host = this.createCompilerHost(fileNames);
    if (this.options.basePath && destination === undefined) {
      throw new Error('Must have a destination path when a basePath is specified ' +
                      this.options.basePath);
    }
    var destinationRoot = destination || this.options.basePath || '';
    var program = ts.createProgram(fileNames, Transpiler.OPTIONS, host);
    program.getSourceFiles()
        // Do not generate output for .d.ts files.
        .filter((sourceFile: ts.SourceFile) => !sourceFile.fileName.match(/\.d\.ts$/))
        .forEach((f: ts.SourceFile) => {
          var dartCode = this.translate(f);
          var outputFile = this.getOutputPath(f.fileName, destinationRoot);
          fsx.mkdirsSync(path.dirname(outputFile));
          fs.writeFileSync(outputFile, dartCode);
        });
  }

  translateProgram(program: ts.Program): string {
    var src = program.getSourceFiles()
                  .filter((sourceFile: ts.SourceFile) => !sourceFile.fileName.match(/\.d\.ts$/) &&
                                                         !!sourceFile.fileName.match(/\.[jt]s$/))
                  .map((f) => this.translate(f))
                  .join('\n');
    return src;
  }

  translateFile(fileName: string): string {
    var host = this.createCompilerHost([fileName]);
    var program = ts.createProgram([fileName], Transpiler.OPTIONS, host);
    return this.translateProgram(program);
  }

  private createCompilerHost(files: string[]): ts.CompilerHost {
    var fileMap: {[s: string]: boolean} = {};
    files.forEach((f) => fileMap[f] = true);
    return {
      getSourceFile(sourceName, languageVersion) {
        // Only transpile the files directly passed in, do not transpile transitive dependencies.
        if (fileMap.hasOwnProperty(sourceName)) {
          var contents = fs.readFileSync(sourceName, 'UTF-8');
          return ts.createSourceFile(sourceName, contents, Transpiler.OPTIONS.target, true);
        }
        if (sourceName === 'lib.d.ts') {
          return ts.createSourceFile(sourceName, '', Transpiler.OPTIONS.target, true);
        }
        return undefined;
      },
      writeFile(name, text, writeByteOrderMark) { fs.writeFile(name, text); },
      getDefaultLibFileName: () => 'lib.d.ts',
      useCaseSensitiveFileNames: () => true,
      getCanonicalFileName: (filename) => filename,
      getCurrentDirectory: () => '',
      getNewLine: () => '\n'
    };
  }

  // Visible for testing.
  getOutputPath(filePath: string, destinationRoot: string): string {
    var relative = this.getRelativeFileName(filePath);
    var dartFile = relative.replace(/.(js|es6|ts)$/, '.dart');
    return path.join(destinationRoot, dartFile);
  }

  private translate(sourceFile: ts.SourceFile): string {
    this.currentFile = sourceFile;
    this.output =
        new Output(sourceFile, this.getRelativeFileName(), this.options.generateSourceMap);
    this.errors = [];
    this.lastCommentIdx = -1;
    this.visit(sourceFile);
    if (this.errors.length) {
      var e = new Error(this.errors.join('\n'));
      e.name = 'TS2DartError';
      throw e;
    }

    return this.output.getResult();
  }

  // For the Dart keyword list see
  // https://www.dartlang.org/docs/dart-up-and-running/ch02.html#keywords
  private static DART_RESERVED_WORDS =
      ('assert break case catch class const continue default do else enum extends false final ' +
       'finally for if in is new null rethrow return super switch this throw true try var void ' +
       'while with')
          .split(/ /);

  // These are the built-in and limited keywords.
  private static DART_OTHER_KEYWORDS =
      ('abstract as async await deferred dynamic export external factory get implements import ' +
       'library operator part set static sync typedef yield')
          .split(/ /);

  getLibraryName(nameForTest?: string) {
    var fileName = this.getRelativeFileName(nameForTest);
    var parts = fileName.split('/');
    return parts.filter((p) => p.length > 0)
        .map((p) => p.replace(/[^\w.]/g, '_'))
        .map((p) => p.replace(/\.[jt]s$/g, ''))
        .map((p) => Transpiler.DART_RESERVED_WORDS.indexOf(p) != -1 ? '_' + p : p)
        .join('.');
  }

  private getRelativeFileName(absolute?: string) {
    var filePath = absolute !== undefined ? absolute : this.currentFile.fileName;
    if (filePath.indexOf('/') !== 0) return filePath;  // relative path.
    var base = this.options.basePath || '';
    if (filePath.indexOf(base) !== 0) {
      throw new Error(`Files must be located under base, got ${filePath} vs ${base}`);
    }
    return path.relative(this.options.basePath || '', filePath);
  }

  emit(s: string) { this.output.emit(s); }
  emitNoSpace(s: string) { this.output.emitNoSpace(s); }

  reportError(n: ts.Node, message: string) {
    var file = n.getSourceFile() || this.currentFile;
    var fileName = this.getRelativeFileName(file.fileName);
    var start = n.getStart(file);
    var pos = file.getLineAndCharacterOfPosition(start);
    // Line and character are 0-based.
    var fullMessage = `${fileName}:${pos.line + 1}:${pos.character + 1}: ${message}`;
    if (this.options.failFast) throw new Error(fullMessage);
    this.errors.push(fullMessage);
  }

  visit(node: ts.Node) {
    this.output.addSourceMapping(node);
    var comments = ts.getLeadingCommentRanges(this.currentFile.text, node.getFullStart());
    if (comments) {
      comments.forEach((c) => {
        if (c.pos <= this.lastCommentIdx) return;
        this.lastCommentIdx = c.pos;
        var text = this.currentFile.text.substring(c.pos, c.end);
        this.emit(text);
        if (c.hasTrailingNewLine) this.emitNoSpace('\n');
      });
    }

    for (var i = 0; i < this.transpilers.length; i++) {
      if (this.transpilers[i].visitNode(node)) return;
    }

    this.reportError(node, 'Unsupported node type ' + (<any>ts).SyntaxKind[node.kind] + ': ' +
                               node.getFullText());
  }
}

class Output {
  private result: string = '';
  private column: number = 1;
  private line: number = 1;

  // Position information.
  private generateSourceMap: boolean;
  private sourceMap: SourceMap.SourceMapGenerator;

  constructor(private currentFile: ts.SourceFile, private relativeFileName,
              generateSourceMap: boolean) {
    if (generateSourceMap) {
      this.sourceMap = new SourceMap.SourceMapGenerator({file: relativeFileName + '.dart'});
      this.sourceMap.setSourceContent(relativeFileName, this.currentFile.text);
    }
  }

  emit(str: string) {
    this.emitNoSpace(' ');
    this.emitNoSpace(str);
  }

  emitNoSpace(str: string) {
    this.result += str;
    for (var i = 0; i < str.length; i++) {
      if (str[i] === '\n') {
        this.line++;
        this.column = 0;
      } else {
        this.column++;
      }
    }
  }

  getResult(): string { return this.result + this.generateSourceMapComment(); }

  addSourceMapping(n: ts.Node) {
    if (!this.sourceMap) return;  // source maps disabled.
    var file = n.getSourceFile() || this.currentFile;
    var start = n.getStart(file);
    var pos = file.getLineAndCharacterOfPosition(start);

    var mapping: SourceMap.Mapping = {
      original: {line: pos.line + 1, column: pos.character},
      generated: {line: this.line, column: this.column},
      source: this.relativeFileName,
    };

    this.sourceMap.addMapping(mapping);
  }

  private generateSourceMapComment() {
    if (!this.sourceMap) return '';
    var base64map = new Buffer(JSON.stringify(this.sourceMap)).toString('base64');
    return '\n\n//# sourceMappingURL=data:application/json;base64,' + base64map;
  }
}

// CLI entry point
if (require.main === module) {
  new Transpiler().transpile(process.argv.slice(2))
}
