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
      new CallTranspiler(this),
      new DeclarationTranspiler(this),
      new ExpressionTranspiler(this),
      new ModuleTranspiler(this, options.generateLibraryName),
      new StatementTranspiler(this),
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

  visitEach(nodes: ts.Node[]) { nodes.forEach((n) => this.visit(n)); }

  visitEachIfPresent(nodes?: ts.Node[]) {
    if (nodes) this.visitEach(nodes);
  }

  visitList(nodes: ts.Node[], separator: string = ',') {
    for (var i = 0; i < nodes.length; i++) {
      this.visit(nodes[i]);
      if (i < nodes.length - 1) this.emit(separator);
    }
  }

  hasAncestor(n: ts.Node, kind: ts.SyntaxKind): boolean {
    for (var parent = n; parent; parent = parent.parent) {
      if (parent.kind === kind) return true;
    }
    return false;
  }

  hasAnnotation(decorators: ts.NodeArray<ts.Decorator>, name: string): boolean {
    if (!decorators) return false;
    return decorators.some((d) => {
      var decName = base.ident(d.expression);
      if (decName === name) return true;
      if (d.expression.kind !== ts.SyntaxKind.CallExpression) return false;
      var callExpr = (<ts.CallExpression>d.expression);
      decName = base.ident(callExpr.expression);
      return decName === name;
    });
  }

  hasFlag(n: {flags: number}, flag: ts.NodeFlags): boolean {
    return n && (n.flags & flag) !== 0 || false;
  }

  private escapeTextForTemplateString(n: ts.Node): string {
    return (<ts.StringLiteralExpression>n).text.replace(/\\/g, '\\\\').replace(/([$'])/g, '\\$1');
  }

  private static DART_TYPES = {
    'Promise': 'Future',
    'Observable': 'Stream',
    'ObservableController': 'StreamController',
    'Date': 'DateTime',
    'StringMap': 'Map'
  };

  visitTypeName(typeName: ts.EntityName) {
    if (typeName.kind !== ts.SyntaxKind.Identifier) {
      this.visit(typeName);
      return;
    }
    var identifier = base.ident(typeName);
    var translated = Transpiler.DART_TYPES[identifier] || identifier;
    this.emit(translated);
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

    switch (node.kind) {
      case ts.SyntaxKind.NumberKeyword:
        this.emit('num');
        break;
      case ts.SyntaxKind.StringKeyword:
        this.emit('String');
        break;
      case ts.SyntaxKind.VoidKeyword:
        this.emit('void');
        break;
      case ts.SyntaxKind.SuperKeyword:
        this.emit('super');
        break;
      case ts.SyntaxKind.BooleanKeyword:
        this.emit('bool');
        break;
      case ts.SyntaxKind.AnyKeyword:
        this.emit('dynamic');
        break;

      // Literals.
      case ts.SyntaxKind.NumericLiteral:
        var sLit = <ts.LiteralExpression>node;
        this.emit(sLit.getText());
        break;
      case ts.SyntaxKind.StringLiteral:
        var sLit = <ts.LiteralExpression>node;
        var text = JSON.stringify(sLit.text);
        // Escape dollar sign since dart will interpolate in double quoted literal
        var text = text.replace(/\$/, '\\$');
        this.emit(text);
        break;
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        this.emit(`'''${this.escapeTextForTemplateString(node)}'''`);
        break;
      case ts.SyntaxKind.TemplateMiddle:
        this.emitNoSpace(this.escapeTextForTemplateString(node));
        break;
      case ts.SyntaxKind.TemplateExpression:
        var tmpl = <ts.TemplateExpression>node;
        if (tmpl.head) this.visit(tmpl.head);
        if (tmpl.templateSpans) this.visitEach(tmpl.templateSpans);
        break;
      case ts.SyntaxKind.TemplateHead:
        this.emit(`'''${this.escapeTextForTemplateString(node)}`); //highlighting bug:'
        break;
      case ts.SyntaxKind.TemplateTail:
        this.emitNoSpace(this.escapeTextForTemplateString(node));
        this.emitNoSpace(`'''`);
        break;
      case ts.SyntaxKind.TemplateSpan:
        var span = <ts.TemplateSpan>node;
        if (span.expression) {
          // Do not emit extra whitespace inside the string template
          this.emitNoSpace('${');
          this.visit(span.expression);
          this.emitNoSpace('}');
        }
        if (span.literal) this.visit(span.literal);
        break;
      case ts.SyntaxKind.ArrayLiteralExpression:
        if (this.hasAncestor(node, ts.SyntaxKind.Decorator)) this.emit('const');
        this.emit('[');
        this.visitList((<ts.ArrayLiteralExpression>node).elements);
        this.emit(']');
        break;
      case ts.SyntaxKind.ObjectLiteralExpression:
        if (this.hasAncestor(node, ts.SyntaxKind.Decorator)) this.emit('const');
        this.emit('{');
        this.visitList((<ts.ObjectLiteralExpression>node).properties);
        this.emit('}');
        break;
      case ts.SyntaxKind.PropertyAssignment:
        var propAssign = <ts.PropertyAssignment>node;
        if (propAssign.name.kind === ts.SyntaxKind.Identifier) {
          // Dart identifiers in Map literals need quoting.
          this.emitNoSpace(' "');
          this.emitNoSpace((<ts.Identifier>propAssign.name).text);
          this.emitNoSpace('"');
        } else {
          this.visit(propAssign.name);
        }
        this.emit(':');
        this.visit(propAssign.initializer);
        break;
      case ts.SyntaxKind.ShorthandPropertyAssignment:
        var shorthand = <ts.ShorthandPropertyAssignment>node;
        this.emitNoSpace(' "');
        this.emitNoSpace(shorthand.name.text);
        this.emitNoSpace('"');
        this.emit(':');
        this.visit(shorthand.name);
        break;

      case ts.SyntaxKind.TrueKeyword:
        this.emit('true');
        break;
      case ts.SyntaxKind.FalseKeyword:
        this.emit('false');
        break;
      case ts.SyntaxKind.NullKeyword:
        this.emit('null');
        break;
      case ts.SyntaxKind.RegularExpressionLiteral:
        this.emit((<ts.LiteralExpression>node).text);
        break;
      case ts.SyntaxKind.ThisKeyword:
        this.emit('this');
        break;

      case ts.SyntaxKind.QualifiedName:
        var first = <ts.QualifiedName>node;
        this.visit(first.left);
        this.emit('.');
        this.visit(first.right);
        break;
      case ts.SyntaxKind.Identifier:
        var ident = <ts.Identifier>node;
        this.emit(ident.text);
        break;

      case ts.SyntaxKind.TypeLiteral:
        // Dart doesn't support type literals.
        this.emit('dynamic');
        break;

      case ts.SyntaxKind.TypeReference:
        var typeRef = <ts.TypeReferenceNode>node;
        this.visitTypeName(typeRef.typeName);
        if (typeRef.typeArguments) {
          this.emit('<');
          this.visitList(typeRef.typeArguments);
          this.emit('>');
        }
        break;
      case ts.SyntaxKind.TypeParameter:
        var typeParam = <ts.TypeParameterDeclaration>node;
        this.visit(typeParam.name);
        if (typeParam.constraint) {
          this.emit('extends');
          this.visit(typeParam.constraint);
        }
        break;
      default:
        this.reportError(node,
            `Unsupported node type ${(<any>ts).SyntaxKind[node.kind]}: ${node.getFullText()}`);
        break;
    }
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
