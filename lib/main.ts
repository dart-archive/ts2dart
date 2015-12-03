require('source-map-support').install();
import SourceMap = require('source-map');
import fs = require('fs');
import path = require('path');
import ts = require('typescript');

import base = require('./base');
import mkdirP from './mkdirp';
import CallTranspiler = require('./call');
import DeclarationTranspiler = require('./declaration');
import ExpressionTranspiler = require('./expression');
import ModuleTranspiler from './module';
import StatementTranspiler = require('./statement');
import TypeTranspiler = require('./type');
import LiteralTranspiler = require('./literal');
import {FacadeConverter} from './facade_converter';

export interface TranspilerOptions {
  /**
   * Fail on the first error, do not collect multiple. Allows easier debugging as stack traces lead
   * directly to the offending line.
   */
  failFast?: boolean;
  /** Whether to generate 'library a.b.c;' names from relative file paths. */
  generateLibraryName?: boolean;
  /** Whether to generate source maps. */
  generateSourceMap?: boolean;
  /**
   * A base path to relativize absolute file paths against. This is useful for library name
   * generation (see above) and nicer file names in error messages.
   */
  basePath?: string;
  /**
   * Translate calls to builtins, i.e. seemlessly convert from `Array` to `List`, and convert the
   * corresponding methods. Requires type checking.
   */
  translateBuiltins?: boolean;
  /**
   * Enforce conventions of public/private keyword and underscore prefix
   */
  enforceUnderscoreConventions?: boolean;
}

export const COMPILER_OPTIONS: ts.CompilerOptions = {
  allowNonTsExtensions: true,
  experimentalDecorators: true,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES5,
  moduleResolution: ts.ModuleResolutionKind.Classic,
};

export class Transpiler {
  private output: Output;
  private currentFile: ts.SourceFile;

  // Comments attach to all following AST nodes before the next 'physical' token. Track the earliest
  // offset to avoid printing comments multiple times.
  private lastCommentIdx: number = -1;
  private errors: string[] = [];

  private transpilers: base.TranspilerBase[];
  private fc: FacadeConverter;

  constructor(private options: TranspilerOptions = {}) {
    this.fc = new FacadeConverter(this);
    this.transpilers = [
      new CallTranspiler(this, this.fc),  // Has to come before StatementTranspiler!
      new DeclarationTranspiler(this, this.fc, options.enforceUnderscoreConventions),
      new ExpressionTranspiler(this, this.fc),
      new LiteralTranspiler(this, this.fc),
      new ModuleTranspiler(this, this.fc, options.generateLibraryName),
      new StatementTranspiler(this),
      new TypeTranspiler(this, this.fc),
    ];
  }

  /**
   * Transpiles the given files to Dart.
   * @param fileNames The input files.
   * @param destination Location to write files to. Creates files next to their sources if absent.
   */
  transpile(fileNames: string[], destination?: string): void {
    if (this.options.basePath) {
      this.options.basePath = this.normalizeSlashes(path.resolve(this.options.basePath));
    }
    fileNames = fileNames.map((f) => this.normalizeSlashes(f));
    var host = this.createCompilerHost();
    if (this.options.basePath && destination === undefined) {
      throw new Error(
          'Must have a destination path when a basePath is specified ' + this.options.basePath);
    }
    var destinationRoot = destination || this.options.basePath || '';
    var program = ts.createProgram(fileNames, this.getCompilerOptions(), host);
    if (this.options.translateBuiltins) {
      this.fc.setTypeChecker(program.getTypeChecker());
    }

    // Only write files that were explicitly passed in.
    var fileSet: {[s: string]: boolean} = {};
    fileNames.forEach((f) => fileSet[f] = true);

    this.errors = [];
    program.getSourceFiles()
        .filter((sourceFile) => fileSet[sourceFile.fileName])
        // Do not generate output for .d.ts files.
        .filter((sourceFile: ts.SourceFile) => !sourceFile.fileName.match(/\.d\.ts$/))
        .forEach((f: ts.SourceFile) => {
          var dartCode = this.translate(f);
          var outputFile = this.getOutputPath(f.fileName, destinationRoot);
          mkdirP(path.dirname(outputFile));
          fs.writeFileSync(outputFile, dartCode);
        });
    this.checkForErrors(program);
  }

  translateProgram(program: ts.Program): {[path: string]: string} {
    if (this.options.translateBuiltins) {
      this.fc.setTypeChecker(program.getTypeChecker());
    }
    var paths: {[path: string]: string} = {};
    this.errors = [];
    program.getSourceFiles()
        .filter(
            (sourceFile: ts.SourceFile) =>
                (!sourceFile.fileName.match(/\.d\.ts$/) && !!sourceFile.fileName.match(/\.[jt]s$/)))
        .forEach((f) => paths[f.fileName] = this.translate(f));
    this.checkForErrors(program);
    return paths;
  }

  private getCompilerOptions() {
    var opts: ts.CompilerOptions = {};
    for (var k in COMPILER_OPTIONS) opts[k] = COMPILER_OPTIONS[k];
    opts.rootDir = this.options.basePath;
    return opts;
  }

  private createCompilerHost(): ts.CompilerHost {
    var defaultLibFileName = ts.getDefaultLibFileName(COMPILER_OPTIONS);
    defaultLibFileName = this.normalizeSlashes(defaultLibFileName);
    return {
      getSourceFile: (sourceName, languageVersion) => {
        var path = sourceName;
        if (sourceName === defaultLibFileName) {
          path = ts.getDefaultLibFilePath(COMPILER_OPTIONS);
        }
        if (!fs.existsSync(path)) return undefined;
        var contents = fs.readFileSync(path, 'UTF-8');
        return ts.createSourceFile(sourceName, contents, COMPILER_OPTIONS.target, true);
      },
      writeFile(name, text, writeByteOrderMark) { fs.writeFile(name, text); },
      fileExists: (filename) => fs.existsSync(filename),
      readFile: (filename) => fs.readFileSync(filename, 'utf-8'),
      getDefaultLibFileName: () => defaultLibFileName,
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
    return this.normalizeSlashes(path.join(destinationRoot, dartFile));
  }

  private translate(sourceFile: ts.SourceFile): string {
    this.currentFile = sourceFile;
    this.output =
        new Output(sourceFile, this.getRelativeFileName(), this.options.generateSourceMap);
    this.lastCommentIdx = -1;
    this.visit(sourceFile);
    return this.output.getResult();
  }

  private checkForErrors(program: ts.Program) {
    var errors = this.errors;

    var diagnostics = program.getGlobalDiagnostics().concat(program.getSyntacticDiagnostics());

    if ((errors.length || diagnostics.length) && this.options.translateBuiltins) {
      // Only report semantic diagnostics if ts2dart failed; this code is not a generic compiler, so
      // only yields TS errors if they could be the cause of ts2dart issues.
      // This greatly speeds up tests and execution.
      diagnostics = diagnostics.concat(program.getSemanticDiagnostics());
    }

    var diagnosticErrs = diagnostics.map((d) => {
      var msg = '';
      if (d.file) {
        let pos = d.file.getLineAndCharacterOfPosition(d.start);
        let fn = this.getRelativeFileName(d.file.fileName);
        msg += ` ${fn}:${pos.line + 1}:${pos.character + 1}`;
      }
      msg += ': ';
      msg += ts.flattenDiagnosticMessageText(d.messageText, '\n');
      return msg;
    });
    if (diagnosticErrs.length) errors = errors.concat(diagnosticErrs);

    if (errors.length) {
      var e = new Error(errors.join('\n'));
      e.name = 'TS2DartError';
      throw e;
    }
  }

  /**
   * Returns `filePath`, relativized to the program's `basePath`.
   * @param filePath Optional path to relativize, defaults to the current file's path.
   */
  getRelativeFileName(filePath?: string) {
    if (filePath === undefined) filePath = this.currentFile.fileName;
    if (!path.isAbsolute(filePath)) {
      filePath = path.resolve(filePath);
    }
    var base = this.options.basePath || '';
    if (filePath.indexOf(base) !== 0 && !filePath.match(/\.d\.ts$/)) {
      throw new Error(`Files must be located under base, got ${filePath} vs ${base}`);
    }
    return this.normalizeSlashes(path.relative(base, filePath));
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
        this.emitNoSpace('\n');
        this.emit(this.translateComment(text));
        if (c.hasTrailingNewLine) this.emitNoSpace('\n');
      });
    }

    for (var i = 0; i < this.transpilers.length; i++) {
      if (this.transpilers[i].visitNode(node)) return;
    }

    this.reportError(
        node,
        'Unsupported node type ' + (<any>ts).SyntaxKind[node.kind] + ': ' + node.getFullText());
  }

  private normalizeSlashes(path: string) { return path.replace(/\\/g, '/'); }

  private translateComment(comment: string): string {
    return comment.replace(/\{@link ([^\}]+)\}/g, '[$1]');
  }
}

class Output {
  private result: string = '';
  private column: number = 1;
  private line: number = 1;

  // Position information.
  private generateSourceMap: boolean;
  private sourceMap: SourceMap.SourceMapGenerator;

  constructor(
      private currentFile: ts.SourceFile, private relativeFileName: string,
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
  var args = require('minimist')(process.argv.slice(2), {base: 'string'});
  try {
    let transpiler = new Transpiler(args);
    console.log('Transpiling', args._, 'to', args.destination);
    transpiler.transpile(args._, args.destination);
  } catch (e) {
    if (e.name !== 'TS2DartError') throw e;
    console.log(e.message);
    process.exit(1);
  }
}
