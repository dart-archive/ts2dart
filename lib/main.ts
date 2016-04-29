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
  /** A tsconfig.json to use to configure TypeScript compilation. */
  tsconfig?: string;
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
  target: ts.ScriptTarget.ES6,
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
    // TODO: Remove the angular2 default when angular uses typingsRoot.
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

    let host: ts.CompilerHost;
    let compilerOpts: ts.CompilerOptions;
    if (this.options.tsconfig) {
      let {config, error} =
          ts.readConfigFile(this.options.tsconfig, (f) => fs.readFileSync(f, 'utf-8'));
      if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
      let {options, errors} = ts.convertCompilerOptionsFromJson(
          config.compilerOptions, path.dirname(this.options.tsconfig));
      if (errors && errors.length) {
        throw new Error(errors.map((d) => this.diagnosticToString(d)).join('\n'));
      }
      host = ts.createCompilerHost(options, /*setParentNodes*/ true);
      compilerOpts = options;
      if (compilerOpts.rootDir != null && this.options.basePath == null) {
        // Use the tsconfig's rootDir if basePath is not set.
        this.options.basePath = compilerOpts.rootDir;
      }
      if (compilerOpts.outDir != null && destination == null) {
        destination = compilerOpts.outDir;
      }
    } else {
      host = this.createCompilerHost();
      compilerOpts = this.getCompilerOptions();
    }

    if (this.options.basePath && destination === undefined) {
      throw new Error(
          'Must have a destination path when a basePath is specified ' + this.options.basePath);
    }
    let destinationRoot = destination || this.options.basePath || '';
    let program = ts.createProgram(fileNames, compilerOpts, host);
    if (this.options.translateBuiltins) {
      this.fc.initializeTypeBasedConversion(program.getTypeChecker(), compilerOpts, host);
    }

    // Only write files that were explicitly passed in.
    let fileSet: {[s: string]: boolean} = {};
    fileNames.forEach((f) => fileSet[f] = true);
    this.errors = [];

    program.getSourceFiles()
        .filter((sourceFile) => fileSet[sourceFile.fileName])
        // Do not generate output for .d.ts files.
        .filter((sourceFile: ts.SourceFile) => !sourceFile.fileName.match(/\.d\.ts$/))
        .forEach((f: ts.SourceFile) => {
          let dartCode = this.translate(f);
          let outputFile = this.getOutputPath(f.fileName, destinationRoot);
          mkdirP(path.dirname(outputFile));
          fs.writeFileSync(outputFile, dartCode);
        });
    this.checkForErrors(program);
  }

  translateProgram(program: ts.Program, host: ts.CompilerHost): {[path: string]: string} {
    if (this.options.translateBuiltins) {
      this.fc.initializeTypeBasedConversion(
          program.getTypeChecker(), program.getCompilerOptions(), host);
    }
    let paths: {[path: string]: string} = {};
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
    let opts: ts.CompilerOptions = {};
    for (let k of Object.keys(COMPILER_OPTIONS)) opts[k] = COMPILER_OPTIONS[k];
    opts.rootDir = this.options.basePath;
    return opts;
  }

  private createCompilerHost(): ts.CompilerHost {
    let defaultLibFileName = ts.getDefaultLibFileName(COMPILER_OPTIONS);
    defaultLibFileName = this.normalizeSlashes(defaultLibFileName);
    let compilerHost: ts.CompilerHost = {
      getSourceFile: (sourceName, languageVersion) => {
        let sourcePath = sourceName;
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
    let relative = this.getRelativeFileName(filePath);
    let dartFile = relative.replace(/.(js|es6|ts)$/, '.dart');
    return this.normalizeSlashes(path.join(destinationRoot, dartFile));
  }

  private translate(sourceFile: ts.SourceFile): string {
    this.currentFile = sourceFile;
    this.output = new Output(
        sourceFile, this.getRelativeFileName(sourceFile.fileName), this.options.generateSourceMap);
    this.lastCommentIdx = -1;
    this.visit(sourceFile);
    let result = this.output.getResult();
    return this.formatCode(result, sourceFile);
  }

  private formatCode(code: string, context: ts.Node) {
    let result = dartStyle.formatCode(code);
    if (result.error) {
      this.reportError(context, result.error);
    }
    return result.code;
  }

  private checkForErrors(program: ts.Program) {
    let errors = this.errors;

    let diagnostics = program.getGlobalDiagnostics().concat(program.getSyntacticDiagnostics());

    if ((errors.length || diagnostics.length) && this.options.translateBuiltins) {
      // Only report semantic diagnostics if ts2dart failed; this code is not a generic compiler, so
      // only yields TS errors if they could be the cause of ts2dart issues.
      // This greatly speeds up tests and execution.
      diagnostics = diagnostics.concat(program.getSemanticDiagnostics());
    }

    let diagnosticErrs = diagnostics.map((d) => this.diagnosticToString(d));
    if (diagnosticErrs.length) errors = errors.concat(diagnosticErrs);

    if (errors.length) {
      let e = new Error(errors.join('\n'));
      e.name = 'TS2DartError';
      throw e;
    }
  }

  private diagnosticToString(diagnostic: ts.Diagnostic): string {
    let msg = '';
    if (diagnostic.file) {
      let pos = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      let fn = this.getRelativeFileName(diagnostic.file.fileName);
      msg += ` ${fn}:${pos.line + 1}:${pos.character + 1}`;
    }
    msg += ': ';
    msg += ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    return msg;
  }

  /**
   * Returns `filePath`, relativized to the program's `basePath`.
   * @param filePath path to relativize.
   */
  getRelativeFileName(filePath: string) {
    let base = this.options.basePath || '';
    if (filePath[0] === '/' && filePath.indexOf(base) !== 0 && !filePath.match(/\.d\.ts$/)) {
      throw new Error(`Files must be located under base, got ${filePath} vs ${base}`);
    }
    let rel = path.relative(base, filePath);
    if (rel.indexOf('../') === 0) {
      // filePath is outside of rel, just use it directly.
      rel = filePath;
    }
    return this.normalizeSlashes(rel);
  }

  emit(s: string) { this.output.emit(s); }
  emitNoSpace(s: string) { this.output.emitNoSpace(s); }

  reportError(n: ts.Node, message: string) {
    let file = n.getSourceFile() || this.currentFile;
    let fileName = this.getRelativeFileName(file.fileName);
    let start = n.getStart(file);
    let pos = file.getLineAndCharacterOfPosition(start);
    // Line and character are 0-based.
    let fullMessage = `${fileName}:${pos.line + 1}:${pos.character + 1}: ${message}`;
    if (this.options.failFast) throw new Error(fullMessage);
    this.errors.push(fullMessage);
  }

  visit(node: ts.Node) {
    this.output.addSourceMapping(node);
    try {
      let comments = ts.getLeadingCommentRanges(this.currentFile.text, node.getFullStart());
      if (comments) {
        comments.forEach((c) => {
          if (c.pos <= this.lastCommentIdx) return;
          this.lastCommentIdx = c.pos;
          let text = this.currentFile.text.substring(c.pos, c.end);
          this.emitNoSpace('\n');
          this.emit(this.translateComment(text));
          if (c.hasTrailingNewLine) this.emitNoSpace('\n');
        });
      }

      for (let i = 0; i < this.transpilers.length; i++) {
        if (this.transpilers[i].visitNode(node)) return;
      }
      this.reportError(
          node, `Unsupported node type ${(<any>ts).SyntaxKind[node.kind]}: ${node.getFullText()}`);
    } catch (e) {
      this.reportError(node, 'ts2dart crashed ' + e.stack);
    }
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
    for (let i = 0; i < str.length; i++) {
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
    if (!this.generateSourceMap) return;  // source maps disabled.
    let file = n.getSourceFile() || this.currentFile;
    let start = n.getStart(file);
    let pos = file.getLineAndCharacterOfPosition(start);

    let mapping: SourceMap.Mapping = {
      original: {line: pos.line + 1, column: pos.character},
      generated: {line: this.line, column: this.column},
      source: this.relativeFileName,
    };

    this.sourceMap.addMapping(mapping);
  }

  private generateSourceMapComment() {
    if (!this.sourceMap) return '';
    let base64map = new Buffer(JSON.stringify(this.sourceMap)).toString('base64');
    return '\n\n//# sourceMappingURL=data:application/json;base64,' + base64map;
  }
}

// CLI entry point
if (require.main === module) {
  let args = require('minimist')(process.argv.slice(2), {base: 'string'});
  try {
    let transpiler = new Transpiler(args);
    console.error('Transpiling', args._, 'to', args.destination);
    transpiler.transpile(args._, args.destination);
  } catch (e) {
    if (e.name !== 'TS2DartError') throw e;
    console.error(e.message);
    process.exit(1);
  }
}
