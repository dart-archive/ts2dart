require('source-map-support').install();
import {SourceMapGenerator} from 'source-map';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import {TranspilerBase} from './base';
import mkdirP from './mkdirp';
import CallTranspiler from './call';
import DeclarationTranspiler from './declaration';
import ExpressionTranspiler from './expression';
import ModuleTranspiler from './module';
import StatementTranspiler from './statement';
import TypeTranspiler from './type';
import LiteralTranspiler from './literal';
import {FacadeConverter} from './facade_converter';
import * as dartStyle from 'dart-style';

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
};

export class Transpiler {
  private output: Output;
  private currentFile: ts.SourceFile;

  // Comments attach to all following AST nodes before the next 'physical' token. Track the earliest
  // offset to avoid printing comments multiple times.
  private lastCommentIdx: number = -1;
  private errors: string[] = [];

  private transpilers: TranspilerBase[];
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
          var outputFile = this.getOutputPath(path.resolve(f.fileName), destinationRoot);
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
    var compilerHost: ts.CompilerHost = {
      getSourceFile: (sourceName, languageVersion) => {
        var sourcePath = sourceName;
        if (sourceName === defaultLibFileName) {
          sourcePath = ts.getDefaultLibFilePath(COMPILER_OPTIONS);
        }
        if (!fs.existsSync(sourcePath)) return undefined;
        let contents = fs.readFileSync(sourcePath, 'UTF-8');
        return ts.createSourceFile(sourceName, contents, COMPILER_OPTIONS.target, true);
      },
      writeFile(name, text, writeByteOrderMark) { fs.writeFile(name, text); },
      fileExists: (filename) => fs.existsSync(filename),
      readFile: (filename) => fs.readFileSync(filename, 'utf-8'),
      getDefaultLibFileName: () => defaultLibFileName,
      useCaseSensitiveFileNames: () => true,
      getCanonicalFileName: (filename) => filename,
      getCurrentDirectory: () => '',
      getNewLine: () => '\n',
    };
    compilerHost.resolveModuleNames = getModuleResolver(compilerHost);
    return compilerHost;
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
    var result = this.output.getResult();
    return this.formatCode(result, sourceFile);
  }

  private formatCode(code: string, context: ts.Node) {
    var result = dartStyle.formatCode(code);
    if (result.error) {
      this.reportError(context, result.error);
    }
    return result.code;
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
    if (filePath === undefined) filePath = path.resolve(this.currentFile.fileName);
    // TODO(martinprobst): Use path.isAbsolute on node v0.12.
    if (this.normalizeSlashes(path.resolve('/x/', filePath)) !== filePath) {
      return filePath;  // already relative.
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
    comment = comment.replace(/\{@link ([^\}]+)\}/g, '[$1]');

    // Remove the following tags and following comments till end of line.
    comment = comment.replace(/@param.*$/gm, '');
    comment = comment.replace(/@throws.*$/gm, '');
    comment = comment.replace(/@return.*$/gm, '');

    // Remove the following tags.
    comment = comment.replace(/@module/g, '');
    comment = comment.replace(/@description/g, '');
    comment = comment.replace(/@deprecated/g, '');

    return comment;
  }
}

export function getModuleResolver(compilerHost: ts.CompilerHost) {
  return (moduleNames: string[], containingFile: string): ts.ResolvedModule[] => {
    let res: ts.ResolvedModule[] = [];
    for (let mod of moduleNames) {
      let lookupRes =
          ts.nodeModuleNameResolver(mod, containingFile, COMPILER_OPTIONS, compilerHost);
      if (lookupRes.resolvedModule) {
        res.push(lookupRes.resolvedModule);
        continue;
      }
      lookupRes = ts.classicNameResolver(mod, containingFile, COMPILER_OPTIONS, compilerHost);
      if (lookupRes.resolvedModule) {
        res.push(lookupRes.resolvedModule);
        continue;
      }
      res.push(undefined);
    }
    return res;
  };
}

class Output {
  private result: string = '';
  private column: number = 1;
  private line: number = 1;

  // Position information.
  private generateSourceMap: boolean;
  private sourceMap: SourceMapGenerator;

  constructor(
      private currentFile: ts.SourceFile, private relativeFileName: string,
      generateSourceMap: boolean) {
    if (generateSourceMap) {
      this.sourceMap = new SourceMapGenerator({file: relativeFileName + '.dart'});
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

  getResult(): string { return this.result; }

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
