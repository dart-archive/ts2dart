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

export type ClassLike = ts.ClassDeclaration | ts.InterfaceDeclaration;

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

  constructor(private options: TranspilerOptions = {}) {}

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
      throw new Error(
          `Must have a destination path when a basePath is specified (${this.options.basePath}`);
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

  translateFile(fileName: string): string {
    var host = this.createCompilerHost([fileName]);
    var program = ts.createProgram([fileName], Transpiler.OPTIONS, host);
    return this.translateProgram(program);
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

  private visitEach(nodes: ts.Node[]) { nodes.forEach((n) => this.visit(n)); }

  private visitEachIfPresent(nodes ?: ts.Node[]) {
    if (nodes) this.visitEach(nodes);
  }

  private visitList(nodes: ts.Node[], separator: string = ',') {
    for (var i = 0; i < nodes.length; i++) {
      this.visit(nodes[i]);
      if (i < nodes.length - 1) this.output.emit(separator);
    }
  }

  private visitParameters(fn: ts.FunctionLikeDeclaration) {
    this.output.emit('(');
    let firstInitParamIdx;
    for (firstInitParamIdx = 0; firstInitParamIdx < fn.parameters.length; firstInitParamIdx++) {
      // ObjectBindingPatterns are handled within the parameter visit.
      if (fn.parameters[firstInitParamIdx].initializer &&
          fn.parameters[firstInitParamIdx].name.kind !== ts.SyntaxKind.ObjectBindingPattern) {
        break;
      }
    }

    if (firstInitParamIdx !== 0) {
      var requiredParams = fn.parameters.slice(0, firstInitParamIdx);
      this.visitList(requiredParams);
    }

    if (firstInitParamIdx !== fn.parameters.length) {
      if (firstInitParamIdx !== 0) this.output.emit(',');
      var positionalOptional = fn.parameters.slice(firstInitParamIdx, fn.parameters.length);
      this.output.emit('[');
      this.visitList(positionalOptional);
      this.output.emit(']');
    }

    this.output.emit(')');
  }

  private visitFunctionLike(fn: ts.FunctionLikeDeclaration, accessor ?: string) {
    if (fn.type) this.visit(fn.type);
    if (accessor) this.output.emit(accessor);
    if (fn.name) this.visit(fn.name);
    // Dart does not even allow the parens of an empty param list on getter
    if (accessor !== 'get') {
      this.visitParameters(fn);
    } else {
      if (fn.parameters && fn.parameters.length > 0) {
        this.reportError(fn, 'getter should not accept parameters');
      }
    }
    if (fn.body) {
      this.visit(fn.body);
    } else {
      this.output.emit(';');
    }
  }

  private visitClassLike(keyword: string, decl: ClassLike) {
    this.visitDecorators(decl.decorators);
    this.output.emit(keyword);
    this.visit(decl.name);
    if (decl.typeParameters) {
      this.output.emit('<');
      this.visitList(decl.typeParameters);
      this.output.emit('>');
    }
    this.visitEachIfPresent(decl.heritageClauses);
    // Check for @IMPLEMENTS interfaces to add.
    // TODO(martinprobst): Drop all special cases for @SOMETHING after migration to TypeScript.
    var implIfs = this.getImplementsDecorators(decl.decorators);
    if (implIfs.length > 0) {
      // Check if we have to emit an 'implements ' or a ', '
      if (decl.heritageClauses && decl.heritageClauses.length > 0 &&
          decl.heritageClauses.some((hc) => hc.token === ts.SyntaxKind.ImplementsKeyword)) {
        // There was some implements clause.
        this.output.emit(',');
      } else {
        this.output.emit('implements');
      }
      this.output.emit(implIfs.join(' , '));
    }
    this.output.emit('{');
    this.visitEachIfPresent(decl.members);
    this.output.emit('}');
  }

  /** Returns the parameters passed to @IMPLEMENTS as the identifier's string values. */
  private getImplementsDecorators(decorators: ts.NodeArray<ts.Decorator>): string[] {
    var interfaces = [];
    if (!decorators) return interfaces;
    decorators.forEach((d) => {
      if (d.expression.kind !== ts.SyntaxKind.CallExpression) return;
      var funcExpr = <ts.CallExpression>d.expression;
      if (Transpiler.ident(funcExpr.expression) !== 'IMPLEMENTS') return;
      funcExpr.arguments.forEach((a) => {
        var interf = Transpiler.ident(a);
        if (!interf) this.reportError(a, '@IMPLEMENTS only supports literal identifiers');
        interfaces.push(interf);
      });
    });
    return interfaces;
  }

  private visitCall(c: ts.CallExpression) {
    this.visit(c.expression);
    this.output.emit('(');
    if (!this.handleNamedParamsCall(c)) {
      this.visitList(c.arguments);
    }
    this.output.emit(')');
  }

  private visitDecorators(decorators: ts.NodeArray<ts.Decorator>) {
    if (!decorators) return;

    var isAbstract = false, isConst = false;
    decorators.forEach((d) => {
      // Special case @CONST & @ABSTRACT
      // TODO(martinprobst): remove once the code base is migrated to TypeScript.
      var name = Transpiler.ident(d.expression);
      if (!name && d.expression.kind === ts.SyntaxKind.CallExpression) {
        // Unwrap @CONST()
        var callExpr = (<ts.CallExpression>d.expression);
        name = Transpiler.ident(callExpr.expression);
      }
      // Make sure these match IGNORED_ANNOTATIONS below.
      // TODO(martinprobst): Re-enable the early exits below once moved to TypeScript.
      if (name === 'ABSTRACT') {
        isAbstract = true;
        // this.output.emit('abstract');
        // return;
      }
      if (name === 'CONST') {
        isConst = true;
        // this.output.emit('const');
        // return;
      }
      if (name === 'IMPLEMENTS') {
        // Ignore @IMPLEMENTS - it's handled above in visitClassLike.
        // return;
      }
      this.output.emit('@');
      this.visit(d.expression);
    });
    if (isAbstract) this.output.emit('abstract');
    if (isConst) this.output.emit('const');
  }

  private hasAncestor(n: ts.Node, kind: ts.SyntaxKind): boolean {
    for (var parent = n; parent; parent = parent.parent) {
      if (parent.kind === kind) return true;
    }
    return false;
  }

  private hasAnnotation(decorators: ts.NodeArray<ts.Decorator>, name: string): boolean {
    if (!decorators) return false;
    return decorators.some((d) => {
      var decName = Transpiler.ident(d.expression);
      if (decName === name) return true;
      if (d.expression.kind !== ts.SyntaxKind.CallExpression) return false;
      var callExpr = (<ts.CallExpression>d.expression);
      decName = Transpiler.ident(callExpr.expression);
      return decName === name;
    });
  }

  private static ident(n: ts.Node): string {
    if (n.kind === ts.SyntaxKind.Identifier) return (<ts.Identifier>n).text;
    if (n.kind === ts.SyntaxKind.QualifiedName) {
      var qname = (<ts.QualifiedName>n);
      var leftName = Transpiler.ident(qname.left);
      if (leftName) return leftName + '.' + Transpiler.ident(qname.right);
    }
    return null;
  }

  private handleNamedParamsCall(c: ts.CallExpression): boolean {
    // Preamble: This is all committed in the name of backwards compat with the traceur transpiler.

    // Terrible hack: transform foo(a, b, {c: d}) into foo(a, b, c: d), which is Dart's calling
    // syntax for named/optional parameters. An alternative would be to transform the method
    // declaration to take a plain object literal and destructure in the method, but then client
    // code written against Dart wouldn't get nice named parameters.
    if (c.arguments.length === 0) return false;
    var last = c.arguments[c.arguments.length - 1];
    if (last.kind !== ts.SyntaxKind.ObjectLiteralExpression) return false;
    var objLit = <ts.ObjectLiteralExpression>last;
    if (objLit.properties.length === 0) return false;
    // Even worse: foo(a, b, {'c': d}) is considered to *not* be a named parameters call.
    var hasNonPropAssignments = objLit.properties.some(
        (p) => p.kind != ts.SyntaxKind.PropertyAssignment ||
               (<ts.PropertyAssignment>p).name.kind !== ts.SyntaxKind.Identifier);
    if (hasNonPropAssignments) return false;

    var len = c.arguments.length - 1;
    this.visitList(c.arguments.slice(0, len));
    if (len) this.output.emit(',');
    var props = objLit.properties;
    for (var i = 0; i < props.length; i++) {
      var prop = <ts.PropertyAssignment>props[i];
      this.output.emit(Transpiler.ident(prop.name));
      this.output.emit(':');
      this.visit(prop.initializer);
      if (i < objLit.properties.length - 1) this.output.emit(',');
    }
    return true;
  }

  private visitNamedParameter(paramDecl: ts.ParameterDeclaration) {
    this.visitDecorators(paramDecl.decorators);
    if (paramDecl.type) {
      // TODO(martinprobst): These are currently silently ignored.
      // this.reportError(paramDecl.type, 'types on named parameters are unsupported');
    }
    this.visit(paramDecl.name);
    if (paramDecl.initializer) {
      if (paramDecl.initializer.kind !== ts.SyntaxKind.ObjectLiteralExpression ||
          (<ts.ObjectLiteralExpression>paramDecl.initializer).properties.length > 0) {
        this.reportError(paramDecl,
                         'initializers for named parameters must be empty object literals');
      }
    }
  }

  private visitExternalModuleReferenceExpr(expr: ts.Expression) {
    // TODO: what if this isn't a string literal?
    var moduleName = <ts.StringLiteralExpression>expr;
    var text = moduleName.text;
    if (text.match(/^\.\//)) {
      // Strip './' to be more Dart-idiomatic.
      text = text.substring(2);
    } else if (!text.match(/^\.\.\//)) {
      // Unprefixed imports are package imports.
      text = 'package:' + text;
    }
    moduleName.text = text + '.dart';
    this.visit(expr);
  }

  private static isIgnoredAnnotation(e: ts.ImportSpecifier) {
    var name = Transpiler.ident(e.name);
    switch (name) {
      case 'CONST':
      case 'ABSTRACT':
      case 'IMPLEMENTS':
        return true;
      default:
        return false;
    }
  }

  private isEmptyImport(n: ts.ImportDeclaration): boolean {
    var bindings = n.importClause.namedBindings;
    if (bindings.kind != ts.SyntaxKind.NamedImports) return false;
    return (<ts.NamedImports>bindings).elements.every(Transpiler.isIgnoredAnnotation);
  }

  private filterImports(ns: ts.ImportOrExportSpecifier[]) {
    return ns.filter((e) => !Transpiler.isIgnoredAnnotation(e));
  }

  private hasConstCtor(decl: ClassLike) {
    return decl.members.some((m) => {
      if (m.kind !== ts.SyntaxKind.Constructor) return false;
      return this.hasAnnotation(m.decorators, 'CONST');
    });
  }

  /**
   * Handles constructor initializer lists and bodies.
   *
   * <p>Dart's super() ctor calls have to be moved to the constructors initializer list, and `const`
   * constructors must be completely empty, only assigning into fields through the initializer list.
   * The code below finds super() calls and handles const constructors, marked with the special
   * `@CONST` annotation.
   *
   * <p>Not emitting super() calls when traversing the ctor body is handled by maybeHandleSuperCall
   * below.
   */
  private visitConstructorBody(ctor: ts.ConstructorDeclaration) {
    var body = ctor.body;
    if (!body) return;

    var errorAssignmentsSuper = 'const constructors can only contain assignments and super calls';
    var errorThisAssignment = 'assignments in const constructors must assign into this.';

    var isConstCtor = this.hasAnnotation(ctor.decorators, 'CONST');
    var superCall;
    var expressions = [];
    // Find super() calls and (if in a const ctor) collect assignment expressions (not statements!)
    body.statements.forEach((stmt) => {
      if (stmt.kind !== ts.SyntaxKind.ExpressionStatement) {
        if (isConstCtor) this.reportError(stmt, errorAssignmentsSuper);
        return;
      }
      var nestedExpr = (<ts.ExpressionStatement>stmt).expression;

      // super() call?
      if (nestedExpr.kind === ts.SyntaxKind.CallExpression) {
        var callExpr = <ts.CallExpression>nestedExpr;
        if (callExpr.expression.kind !== ts.SyntaxKind.SuperKeyword) {
          if (isConstCtor) this.reportError(stmt, errorAssignmentsSuper);
          return;
        }
        superCall = callExpr;
        return;
      }

      // this.x assignment?
      if (isConstCtor) {
        // Check for assignment.
        if (nestedExpr.kind !== ts.SyntaxKind.BinaryExpression) {
          this.reportError(nestedExpr, errorAssignmentsSuper);
          return;
        }
        var binExpr = <ts.BinaryExpression>nestedExpr;
        if (binExpr.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
          this.reportError(binExpr, errorAssignmentsSuper);
          return;
        }
        // Check for 'this.'
        if (binExpr.left.kind !== ts.SyntaxKind.PropertyAccessExpression) {
          this.reportError(binExpr, errorThisAssignment);
          return;
        }
        var lhs = <ts.PropertyAccessExpression>binExpr.left;
        if (lhs.expression.kind !== ts.SyntaxKind.ThisKeyword) {
          this.reportError(binExpr, errorThisAssignment);
          return;
        }
        var ident = lhs.name;
        binExpr.left = ident;
        expressions.push(nestedExpr);
      }
    });

    var hasInitializerExpr = expressions.length > 0;
    if (hasInitializerExpr) {
      // Write out the assignments.
      this.output.emit(':');
      this.visitList(expressions);
    }
    if (superCall) {
      this.output.emit(hasInitializerExpr ? ',' : ':');
      this.output.emit('super (');
      if (!this.handleNamedParamsCall(superCall)) {
        this.visitList(superCall.arguments);
      }
      this.output.emit(')');
    }
    if (isConstCtor) {
      // Const ctors don't have bodies.
      this.output.emit(';');
    } else {
      this.visit(ctor.body);
    }
  }

  /**
   * Checks whether `callExpr` is a super() call that should be ignored because it was already
   * handled by `maybeEmitSuperInitializer` above.
   */
  private maybeHandleSuperCall(callExpr: ts.CallExpression): boolean {
    if (callExpr.expression.kind !== ts.SyntaxKind.SuperKeyword) return false;
    // Sanity check that there was indeed a ctor directly above this call.
    var exprStmt = callExpr.parent;
    var ctorBody = exprStmt.parent;
    var ctor = ctorBody.parent;
    if (ctor.kind !== ts.SyntaxKind.Constructor) {
      this.reportError(callExpr, 'super calls must be immediate children of their constructors');
      return false;
    }
    this.output.emit('/* super call moved to initializer */');
    return true;
  }

  private hasFlag(n: {flags: number}, flag: ts.NodeFlags): boolean {
    return n && (n.flags & flag) !== 0 || false;
  }

  private visitDeclarationMetadata(decl: ts.Declaration) {
    this.visitDecorators(decl.decorators);
    this.visitEachIfPresent(decl.modifiers);

    // Temporarily deactivated to make migration of Angular code base easier.
    return;

    if (this.hasFlag(decl.modifiers, ts.NodeFlags.Protected)) {
      this.reportError(decl, 'protected declarations are unsupported');
      return;
    }
    var name = Transpiler.ident(decl.name);
    if (!name) return;
    var isPrivate = this.hasFlag(decl.modifiers, ts.NodeFlags.Private);
    var matchesPrivate = !!name.match(/^_/);
    if (isPrivate && !matchesPrivate) {
      this.reportError(decl, 'private members must be prefixed with "_"');
    }
    if (!isPrivate && matchesPrivate) {
      this.reportError(decl, 'public members must not be prefixed with "_"');
    }
  }

  private escapeTextForTemplateString(n: ts.Node): string {
    return (<ts.StringLiteralExpression>n).text.replace(/\\/g, '\\\\').replace(/([$'])/g, '\\$1');
  }

  private visitVariableDeclarationType(varDecl: ts.VariableDeclaration) {
    /* Note: VariableDeclarationList can only occur as part of a for loop. This helper method
     * is meant for processing for-loop variable declaration types only.
     *
     * In Dart, all variables in a variable declaration list must have the same type. Since
     * we are doing syntax directed translation, we cannot reliably determine if distinct
     * variables are declared with the same type or not. Hence we support the following cases:
     *
     * - A variable declaration list with a single variable can be explicitly typed.
     * - When more than one variable is in the list, all must be implicitly typed.
     */
    var firstDecl = varDecl.parent.declarations[0];
    var msg = 'Variables in a declaration list of more than one variable cannot by typed';
    var isConst = this.hasFlag(varDecl.parent, ts.NodeFlags.Const);
    if (firstDecl === varDecl) {
      if (isConst) this.output.emit('const');
      if (!varDecl.type) {
        if (!isConst) this.output.emit('var');
      } else if (varDecl.parent.declarations.length > 1) {
        this.reportError(varDecl, msg);
      } else {
        this.visit(varDecl.type);
      }
    } else if (varDecl.type) {
      this.reportError(varDecl, msg);
    }
  }

  private static DART_TYPES = {
    'Promise': 'Future',
    'Observable': 'Stream',
    'ObservableController': 'StreamController',
    'Date': 'DateTime',
    'StringMap': 'Map'
  };

  private visitTypeName(typeName: ts.EntityName) {
    if (typeName.kind !== ts.SyntaxKind.Identifier) {
      this.visit(typeName);
      return;
    }
    var identifier = Transpiler.ident(typeName);
    var translated = Transpiler.DART_TYPES[identifier] || identifier;
    this.output.emit(translated);
  }

  // For the Dart keyword list see
  // https://www.dartlang.org/docs/dart-up-and-running/ch02.html#keywords
  private static DART_RESERVED_WORDS =
      ('assert break case catch class const continue default do else enum extends false final ' +
      'finally for if in is new null rethrow return super switch this throw true try var void ' +
      'while with').split(/ /);

  // These are the built-in and limited keywords.
  private static DART_OTHER_KEYWORDS =
      ('abstract as async await deferred dynamic export external factory get implements import ' +
      'library operator part set static sync typedef yield').split(/ /);

  private getLibraryName(nameForTest?: string) {
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

  private reportError(n: ts.Node, message: string) {
    var file = n.getSourceFile() || this.currentFile;
    var fileName = this.getRelativeFileName(file.fileName);
    var start = n.getStart(file);
    var pos = file.getLineAndCharacterOfPosition(start);
    // Line and character are 0-based.
    var fullMessage = `${fileName}:${pos.line + 1}:${pos.character + 1}: ${message}`;
    if (this.options.failFast) throw new Error(fullMessage);
    this.errors.push(fullMessage);
  }

  private visit(node: ts.Node) {
    this.output.addSourceMapping(node);
    var comments = ts.getLeadingCommentRanges(this.currentFile.text, node.getFullStart());
    if (comments) {
      comments.forEach((c) => {
        if (c.pos <= this.lastCommentIdx) return;
        this.lastCommentIdx = c.pos;
        var text = this.currentFile.text.substring(c.pos, c.end);
        this.output.emit(text);
        if (c.hasTrailingNewLine) this.output.emitNoSpace('\n');
      });
    }

    switch (node.kind) {
      case ts.SyntaxKind.SourceFile:
        if (this.options.generateLibraryName) {
          this.output.emit('library');
          this.output.emit(this.getLibraryName());
          this.output.emit(';');
        }
        ts.forEachChild(node, this.visit.bind(this));
        break;
      case ts.SyntaxKind.EndOfFileToken:
        ts.forEachChild(node, this.visit.bind(this));
        break;

      case ts.SyntaxKind.VariableDeclarationList:
        // Note: VariableDeclarationList can only occur as part of a for loop.
        var varDeclList = <ts.VariableDeclarationList>node;
        this.visitList(varDeclList.declarations);
        break;

      case ts.SyntaxKind.VariableDeclaration:
        var varDecl = <ts.VariableDeclaration>node;
        this.visitVariableDeclarationType(varDecl);
        this.visit(varDecl.name);
        if (varDecl.initializer) {
          this.output.emit('=');
          this.visit(varDecl.initializer);
        }
        break;

      case ts.SyntaxKind.NumberKeyword:
        this.output.emit('num');
        break;
      case ts.SyntaxKind.StringKeyword:
        this.output.emit('String');
        break;
      case ts.SyntaxKind.VoidKeyword:
        this.output.emit('void');
        break;
      case ts.SyntaxKind.SuperKeyword:
        this.output.emit('super');
        break;
      case ts.SyntaxKind.BooleanKeyword:
        this.output.emit('bool');
        break;
      case ts.SyntaxKind.AnyKeyword:
        this.output.emit('dynamic');
        break;

      case ts.SyntaxKind.ParenthesizedExpression:
        var parenExpr = <ts.ParenthesizedExpression>node;
        this.output.emit('(');
        this.visit(parenExpr.expression);
        this.output.emit(')');
        break;

      case ts.SyntaxKind.VariableStatement:
        var variableStmt = <ts.VariableStatement>node;
        this.visit(variableStmt.declarationList);
        this.output.emit(';');
        break;
      case ts.SyntaxKind.ExpressionStatement:
        var expr = <ts.ExpressionStatement>node;
        this.visit(expr.expression);
        this.output.emit(';');
        break;
      case ts.SyntaxKind.SwitchStatement:
        var switchStmt = <ts.SwitchStatement>node;
        this.output.emit('switch (');
        this.visit(switchStmt.expression);
        this.output.emit(')');
        this.visit(switchStmt.caseBlock);
        break;
      case ts.SyntaxKind.CaseBlock:
        this.output.emit('{');
        this.visitEach((<ts.CaseBlock>node).clauses);
        this.output.emit('}');
        break;
      case ts.SyntaxKind.CaseClause:
        var caseClause = <ts.CaseClause>node;
        this.output.emit('case');
        this.visit(caseClause.expression);
        this.output.emit(':');
        this.visitEach(caseClause.statements);
        break;
      case ts.SyntaxKind.DefaultClause:
        this.output.emit('default :');
        this.visitEach((<ts.DefaultClause>node).statements);
        break;
      case ts.SyntaxKind.IfStatement:
        var ifStmt = <ts.IfStatement>node;
        this.output.emit('if (');
        this.visit(ifStmt.expression);
        this.output.emit(')');
        this.visit(ifStmt.thenStatement);
        if (ifStmt.elseStatement) {
          this.output.emit('else');
          this.visit(ifStmt.elseStatement);
        }
        break;

      case ts.SyntaxKind.ForStatement:
        var forStmt = <ts.ForStatement>node;
        this.output.emit('for (');
        if (forStmt.initializer) this.visit(forStmt.initializer);
        this.output.emit(';');
        if (forStmt.condition) this.visit(forStmt.condition);
        this.output.emit(';');
        if (forStmt.iterator) this.visit(forStmt.iterator);
        this.output.emit(')');
        this.visit(forStmt.statement);
        break;
      case ts.SyntaxKind.ForInStatement:
        // TODO(martinprobst): Dart's for-in loops actually have different semantics, they are more
        // like for-of loops, iterating over collections.
        var forInStmt = <ts.ForInStatement>node;
        this.output.emit('for (');
        if (forInStmt.initializer) this.visit(forInStmt.initializer);
        this.output.emit('in');
        this.visit(forInStmt.expression);
        this.output.emit(')');
        this.visit(forInStmt.statement);
        break;
      case ts.SyntaxKind.WhileStatement:
        var whileStmt = <ts.WhileStatement>node;
        this.output.emit('while (');
        this.visit(whileStmt.expression);
        this.output.emit(')');
        this.visit(whileStmt.statement);
        break;
      case ts.SyntaxKind.DoStatement:
        var doStmt = <ts.DoStatement>node;
        this.output.emit('do');
        this.visit(doStmt.statement);
        this.output.emit('while (');
        this.visit(doStmt.expression);
        this.output.emit(') ;');
        break;

      case ts.SyntaxKind.TryStatement:
        var tryStmt = <ts.TryStatement>node;
        this.output.emit('try');
        this.visit(tryStmt.tryBlock);
        if (tryStmt.catchClause) {
          this.visit(tryStmt.catchClause);
        }
        if (tryStmt.finallyBlock) {
          this.output.emit('finally');
          this.visit(tryStmt.finallyBlock);
        }
        break;
      case ts.SyntaxKind.CatchClause:
        var ctch = <ts.CatchClause>node;
        if (ctch.variableDeclaration.type) {
          this.output.emit('on');
          this.visit(ctch.variableDeclaration.type);
        }
        this.output.emit('catch');
        this.output.emit('(');
        this.visit(ctch.variableDeclaration.name);
        this.output.emit(')');
        this.visit(ctch.block);
        break;

      // Literals.
      case ts.SyntaxKind.NumericLiteral:
        var sLit = <ts.LiteralExpression>node;
        this.output.emit(sLit.getText());
        break;
      case ts.SyntaxKind.StringLiteral:
        var sLit = <ts.LiteralExpression>node;
        var text = JSON.stringify(sLit.text);
        // Escape dollar sign since dart will interpolate in double quoted literal
        var text = text.replace(/\$/, '\\$');
        this.output.emit(text);
        break;
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        this.output.emit(`'''${this.escapeTextForTemplateString(node)}'''`);
        break;
      case ts.SyntaxKind.TemplateMiddle:
        this.output.emitNoSpace(this.escapeTextForTemplateString(node));
        break;
      case ts.SyntaxKind.TemplateExpression:
        var tmpl = <ts.TemplateExpression>node;
        if (tmpl.head) this.visit(tmpl.head);
        if (tmpl.templateSpans) this.visitEach(tmpl.templateSpans);
        break;
      case ts.SyntaxKind.TemplateHead:
        this.output.emit(`'''${this.escapeTextForTemplateString(node)}`); //highlighting bug:'
        break;
      case ts.SyntaxKind.TemplateTail:
        this.output.emitNoSpace(this.escapeTextForTemplateString(node));
        this.output.emitNoSpace(`'''`);
        break;
      case ts.SyntaxKind.TemplateSpan:
        var span = <ts.TemplateSpan>node;
        if (span.expression) {
          // Do not emit extra whitespace inside the string template
          this.output.emitNoSpace('${');
          this.visit(span.expression);
          this.output.emitNoSpace('}');
        }
        if (span.literal) this.visit(span.literal);
        break;
      case ts.SyntaxKind.ArrayLiteralExpression:
        if (this.hasAncestor(node, ts.SyntaxKind.Decorator)) this.output.emit('const');
        this.output.emit('[');
        this.visitList((<ts.ArrayLiteralExpression>node).elements);
        this.output.emit(']');
        break;
      case ts.SyntaxKind.ObjectLiteralExpression:
        if (this.hasAncestor(node, ts.SyntaxKind.Decorator)) this.output.emit('const');
        this.output.emit('{');
        this.visitList((<ts.ObjectLiteralExpression>node).properties);
        this.output.emit('}');
        break;
      case ts.SyntaxKind.PropertyAssignment:
        var propAssign = <ts.PropertyAssignment>node;
        if (propAssign.name.kind === ts.SyntaxKind.Identifier) {
          // Dart identifiers in Map literals need quoting.
          this.output.emitNoSpace(' "');
          this.output.emitNoSpace((<ts.Identifier>propAssign.name).text);
          this.output.emitNoSpace('"');
        } else {
          this.visit(propAssign.name);
        }
        this.output.emit(':');
        this.visit(propAssign.initializer);
        break;
      case ts.SyntaxKind.ShorthandPropertyAssignment:
        var shorthand = <ts.ShorthandPropertyAssignment>node;
        this.output.emitNoSpace(' "');
        this.output.emitNoSpace(shorthand.name.text);
        this.output.emitNoSpace('"');
        this.output.emit(':');
        this.visit(shorthand.name);
        break;
      case ts.SyntaxKind.TrueKeyword:
        this.output.emit('true');
        break;
      case ts.SyntaxKind.FalseKeyword:
        this.output.emit('false');
        break;
      case ts.SyntaxKind.NullKeyword:
        this.output.emit('null');
        break;
      case ts.SyntaxKind.RegularExpressionLiteral:
        this.output.emit((<ts.LiteralExpression>node).text);
        break;
      case ts.SyntaxKind.ThisKeyword:
        this.output.emit('this');
        break;
      case ts.SyntaxKind.StaticKeyword:
        this.output.emit('static');
        break;
      case ts.SyntaxKind.PrivateKeyword:
        // no-op, handled through '_' naming convention in Dart.
        break;
      case ts.SyntaxKind.ProtectedKeyword:
        // Error - handled in `visitDeclarationModifiers` above.
        break;
      case ts.SyntaxKind.PropertyAccessExpression:
        var propAccess = <ts.PropertyAccessExpression>node;
        this.visit(propAccess.expression);
        this.output.emit('.');
        this.visit(propAccess.name);
        break;
      case ts.SyntaxKind.ElementAccessExpression:
        var elemAccess = <ts.ElementAccessExpression>node;
        this.visit(elemAccess.expression);
        this.output.emit('[');
        this.visit(elemAccess.argumentExpression);
        this.output.emit(']');
        break;
      case ts.SyntaxKind.NewExpression:
        if (this.hasAncestor(node, ts.SyntaxKind.Decorator)) {
          // Constructor calls in annotations must be const constructor calls.
          this.output.emit('const');
        } else {
          this.output.emit('new');
        }
        this.visitCall(<ts.NewExpression>node);
        break;
      case ts.SyntaxKind.CallExpression:
        var callExpr = <ts.CallExpression>node;
        if (!this.maybeHandleSuperCall(callExpr)) {
          this.visitCall(callExpr);
        }
        break;
      case ts.SyntaxKind.BinaryExpression:
        var binExpr = <ts.BinaryExpression>node;
        var operatorKind = binExpr.operatorToken.kind;
        if (operatorKind === ts.SyntaxKind.EqualsEqualsEqualsToken || operatorKind === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
          if (operatorKind === ts.SyntaxKind.ExclamationEqualsEqualsToken) this.output.emit('!');
          this.output.emit('identical (');
          this.visit(binExpr.left);
          this.output.emit(',');
          this.visit(binExpr.right);
          this.output.emit(')');
        } else {
          this.visit(binExpr.left);
          if (operatorKind === ts.SyntaxKind.InstanceOfKeyword) {
            this.output.emit('is');
          } else {
            this.output.emit(ts.tokenToString(binExpr.operatorToken.kind));
          }
          this.visit(binExpr.right);
        }
        break;
      case ts.SyntaxKind.PrefixUnaryExpression:
        var prefixUnary = <ts.PrefixUnaryExpression>node;
        this.output.emit(ts.tokenToString(prefixUnary.operator));
        this.visit(prefixUnary.operand);
        break;
      case ts.SyntaxKind.PostfixUnaryExpression:
        var postfixUnary = <ts.PostfixUnaryExpression>node;
        this.visit(postfixUnary.operand);
        this.output.emit(ts.tokenToString(postfixUnary.operator));
        break;
      case ts.SyntaxKind.ConditionalExpression:
        var conditional = <ts.ConditionalExpression>node;
        this.visit(conditional.condition);
        this.output.emit('?');
        this.visit(conditional.whenTrue);
        this.output.emit(':');
        this.visit(conditional.whenFalse);
        break;
      case ts.SyntaxKind.DeleteExpression:
        this.reportError(node, 'delete operator is unsupported');
        break;
      case ts.SyntaxKind.VoidExpression:
        this.reportError(node, 'void operator is unsupported');
        break;
      case ts.SyntaxKind.TypeOfExpression:
        this.reportError(node, 'typeof operator is unsupported');
        break;

      case ts.SyntaxKind.QualifiedName:
        var first = <ts.QualifiedName>node;
        this.visit(first.left);
        this.output.emit('.');
        this.visit(first.right);
        break;
      case ts.SyntaxKind.Identifier:
        var ident = <ts.Identifier>node;
        this.output.emit(ident.text);
        break;

      case ts.SyntaxKind.TypeLiteral:
        // Dart doesn't support type literals.
        this.output.emit('dynamic');
        break;

      case ts.SyntaxKind.TypeReference:
        var typeRef = <ts.TypeReferenceNode>node;
        this.visitTypeName(typeRef.typeName);
        if (typeRef.typeArguments) {
          this.output.emit('<');
          this.visitList(typeRef.typeArguments);
          this.output.emit('>');
        }
        break;
      case ts.SyntaxKind.TypeParameter:
        var typeParam = <ts.TypeParameterDeclaration>node;
        this.visit(typeParam.name);
        if (typeParam.constraint) {
          this.output.emit('extends');
          this.visit(typeParam.constraint);
        }
        break;

      // Classes & Interfaces
      case ts.SyntaxKind.ClassDeclaration:
        var classDecl = <ts.ClassDeclaration>node;
        this.visitClassLike('class', classDecl);
        break;

      case ts.SyntaxKind.InterfaceDeclaration:
        var ifDecl = <ts.InterfaceDeclaration>node;
        this.visitClassLike('abstract class', ifDecl);
        break;

      case ts.SyntaxKind.EnumDeclaration:
        var decl = <ts.EnumDeclaration>node;
        // The only legal modifier for an enum decl is const.
        var isConst = decl.modifiers && (decl.modifiers.flags & ts.NodeFlags.Const);
        if (isConst) {
          this.reportError(node, 'const enums are not supported');
        }
        this.output.emit('enum');
        this.visit(decl.name);
        this.output.emit('{');
        // Enums can be empty in TS ...
        if (decl.members.length === 0) {
          // ... but not in Dart.
          this.reportError(node, 'empty enums are not supported');
        }
        this.visitList(decl.members);
        this.output.emit('}');
        break;

      case ts.SyntaxKind.EnumMember:
        var member = <ts.EnumMember>node;
        this.visit(member.name);
        if (member.initializer) {
          this.reportError(node, 'enum initializers are not supported');
        }
        break;

      case ts.SyntaxKind.HeritageClause:
        var heritageClause = <ts.HeritageClause>node;
        if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
          this.output.emit('extends');
        } else {
          this.output.emit('implements');
        }
        // Can only have one member for extends clauses.
        this.visitList(heritageClause.types);
        break;

      case ts.SyntaxKind.Constructor:
        var ctorDecl = <ts.ConstructorDeclaration>node;
        // Find containing class name.
        var className;
        for (var parent = ctorDecl.parent; parent; parent = parent.parent) {
          if (parent.kind == ts.SyntaxKind.ClassDeclaration) {
            className = (<ts.ClassDeclaration>parent).name;
            break;
          }
        }
        if (!className) this.reportError(ctorDecl, 'cannot find outer class node');
        this.visitDeclarationMetadata(ctorDecl);
        this.visit(className);
        this.visitParameters(ctorDecl);
        this.visitConstructorBody(ctorDecl);
        break;
      case ts.SyntaxKind.PropertyDeclaration:
        var propertyDecl = <ts.PropertyDeclaration>node;
        this.visitDeclarationMetadata(propertyDecl);
        var hasConstCtor = this.hasConstCtor(<ClassLike>propertyDecl.parent);
        if (hasConstCtor) {
          this.output.emit('final');
        }
        if (propertyDecl.type) {
          this.visit(propertyDecl.type);
        } else if (!hasConstCtor) {
          this.output.emit('var');
        }
        this.visit(propertyDecl.name);
        if (propertyDecl.initializer) {
          this.output.emit('=');
          this.visit(propertyDecl.initializer);
        }
        this.output.emit(';');
        break;
      case ts.SyntaxKind.MethodDeclaration:
        this.visitDeclarationMetadata(<ts.MethodDeclaration>node);
        this.visitFunctionLike(<ts.MethodDeclaration>node);
        break;
      case ts.SyntaxKind.GetAccessor:
        this.visitDeclarationMetadata(<ts.MethodDeclaration>node);
        this.visitFunctionLike(<ts.AccessorDeclaration>node, 'get');
        break;
      case ts.SyntaxKind.SetAccessor:
        this.visitDeclarationMetadata(<ts.MethodDeclaration>node);
        this.visitFunctionLike(<ts.AccessorDeclaration>node, 'set');
        break;
      case ts.SyntaxKind.FunctionDeclaration:
        var funcDecl = <ts.FunctionDeclaration>node;
        this.visitDecorators(funcDecl.decorators);
        if (funcDecl.typeParameters) this.reportError(node, 'generic functions are unsupported');
        this.visitFunctionLike(funcDecl);
        break;

      case ts.SyntaxKind.ArrowFunction:
        var arrowFunc = <ts.FunctionExpression>node;
        // Dart only allows expressions following the fat arrow operator.
        // If the body is a block, we have to drop the fat arrow and emit an
        // anonymous function instead.
        if (arrowFunc.body.kind == ts.SyntaxKind.Block) {
          this.visitFunctionLike(arrowFunc);
        } else {
          this.visitParameters(arrowFunc);
          this.output.emit('=>');
          this.visit(arrowFunc.body);
        }
        break;
      case ts.SyntaxKind.FunctionExpression:
        var funcExpr = <ts.FunctionExpression>node;
        this.visitFunctionLike(funcExpr);
        break;

      case ts.SyntaxKind.MethodSignature:
        var methodSignatureDecl = <ts.FunctionLikeDeclaration>node;
        this.output.emit('abstract');
        this.visitEachIfPresent(methodSignatureDecl.modifiers);
        this.visitFunctionLike(methodSignatureDecl);
        break;

      case ts.SyntaxKind.Parameter:
        var paramDecl = <ts.ParameterDeclaration>node;
        if (paramDecl.dotDotDotToken) this.reportError(node, 'rest parameters are unsupported');
        if (paramDecl.name.kind === ts.SyntaxKind.ObjectBindingPattern) {
          this.visitNamedParameter(paramDecl);
          break;
        }
        this.visitDecorators(paramDecl.decorators);
        if (paramDecl.type) this.visit(paramDecl.type);
        this.visit(paramDecl.name);
        if (paramDecl.initializer) {
          this.output.emit('=');
          this.visit(paramDecl.initializer);
        }
        break;
      case ts.SyntaxKind.ObjectBindingPattern:
        var bindingPattern = <ts.BindingPattern>node;
        this.output.emit('{');
        this.visitList(bindingPattern.elements);
        this.output.emit('}');
        break;
      case ts.SyntaxKind.BindingElement:
        var bindingElement = <ts.BindingElement>node;
        this.visit(bindingElement.name);
        if (bindingElement.initializer) {
          this.output.emit(':');
          this.visit(bindingElement.initializer);
        }
        break;

      case ts.SyntaxKind.EmptyStatement:
        this.output.emit(';');
        break;
      case ts.SyntaxKind.ReturnStatement:
        var retStmt = <ts.ReturnStatement>node;
        this.output.emit('return');
        if (retStmt.expression) this.visit(retStmt.expression);
        this.output.emit(';');
        break;
      case ts.SyntaxKind.BreakStatement:
      case ts.SyntaxKind.ContinueStatement:
        var breakContinue = <ts.BreakOrContinueStatement>node;
        this.output.emit(breakContinue.kind == ts.SyntaxKind.BreakStatement ? 'break' : 'continue');
        if (breakContinue.label) this.visit(breakContinue.label);
        this.output.emit(';');
        break;
      case ts.SyntaxKind.ThrowStatement:
        this.output.emit('throw');
        this.visit((<ts.ThrowStatement>node).expression);
        this.output.emit(';');
        break;

      case ts.SyntaxKind.Block:
        this.output.emit('{');
        this.visitEach((<ts.Block>node).statements);
        this.output.emit('}');
        break;

      case ts.SyntaxKind.ImportDeclaration:
        var importDecl = <ts.ImportDeclaration>node;
        // TODO(martinprobst): Re-enable once moved to TypeScript.
        // if (this.isEmptyImport(importDecl)) return;
        this.output.emit('import');
        this.visitExternalModuleReferenceExpr(importDecl.moduleSpecifier);
        if (importDecl.importClause) {
          this.visit(importDecl.importClause);
        } else {
          this.reportError(importDecl, 'bare import is unsupported');
        }
        this.output.emit(';');
        break;
      case ts.SyntaxKind.ImportClause:
        var importClause = <ts.ImportClause>node;
        if (importClause.name) this.visitTypeName(importClause.name);
        if (importClause.namedBindings) {
          this.visit(importClause.namedBindings);
        }
        break;
      case ts.SyntaxKind.NamespaceImport:
        var nsImport = <ts.NamespaceImport>node;
        this.output.emit('as');
        this.visitTypeName(nsImport.name);
        break;
      case ts.SyntaxKind.NamedImports:
        this.output.emit('show');
        // TODO(martinprobst): Re-enable once moved to TypeScript.
        // var used = this.filterImports((<ts.NamedImports>node).elements);
        // if (used.length === 0) {
        //  this.reportError(node, 'internal error, used imports must not be empty');
        // }
        this.visitList((<ts.NamedImports>node).elements);
        break;
      case ts.SyntaxKind.NamedExports:
        this.output.emit('show');
        this.visitList((<ts.NamedExports>node).elements);
        break;
      case ts.SyntaxKind.ImportSpecifier:
      case ts.SyntaxKind.ExportSpecifier:
        var spec = <ts.ImportOrExportSpecifier>node;
        if (spec.propertyName) this.visitTypeName(spec.propertyName);
        this.visitTypeName(spec.name);
        break;
      case ts.SyntaxKind.ExportDeclaration:
        var exportDecl = <ts.ExportDeclaration>node;
        this.output.emit('export');
        if (exportDecl.moduleSpecifier) {
          this.visitExternalModuleReferenceExpr(exportDecl.moduleSpecifier);
        } else {
          this.reportError(node, 're-exports must have a module URL (export x from "./y").');
        }
        if (exportDecl.exportClause) this.visit(exportDecl.exportClause);
        this.output.emit(';');
        break;
      case ts.SyntaxKind.ImportEqualsDeclaration:
        var importEqDecl = <ts.ImportEqualsDeclaration>node;
        this.output.emit('import');
        this.visit(importEqDecl.moduleReference);
        this.output.emit('as');
        this.visitTypeName(importEqDecl.name);
        this.output.emit(';');
        break;
      case ts.SyntaxKind.ExternalModuleReference:
        this.visitExternalModuleReferenceExpr((<ts.ExternalModuleReference>node).expression);
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

  getResult(): string {
    return this.result + this.generateSourceMapComment();
  }

  addSourceMapping(n: ts.Node) {
    if (!this.sourceMap) return; // source maps disabled.
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
