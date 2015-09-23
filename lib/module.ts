import ts = require('typescript');
import base = require('./base');
import ts2dart = require('./main');
import {FacadeConverter} from './facade_converter';

export default class ModuleTranspiler extends base.TranspilerBase {
  constructor(tr: ts2dart.Transpiler, private fc: FacadeConverter,
              private generateLibraryName: boolean) {
    super(tr);
  }

  visitNode(node: ts.Node): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.SourceFile:
        if (this.generateLibraryName) {
          this.emit('library');
          this.emit(this.getLibraryName());
          this.emit(';');
        }
        this.fc.emitExtraImports(<ts.SourceFile>node);
        ts.forEachChild(node, this.visit.bind(this));
        break;
      case ts.SyntaxKind.EndOfFileToken:
        ts.forEachChild(node, this.visit.bind(this));
        break;
      case ts.SyntaxKind.ImportDeclaration:
        var importDecl = <ts.ImportDeclaration>node;
        if (this.isEmptyImport(importDecl)) return true;
        this.emit('import');
        this.visitExternalModuleReferenceExpr(importDecl.moduleSpecifier);
        if (importDecl.importClause) {
          this.visit(importDecl.importClause);
        } else {
          this.reportError(importDecl, 'bare import is unsupported');
        }
        this.emit(';');
        break;
      case ts.SyntaxKind.ImportClause:
        var importClause = <ts.ImportClause>node;
        if (importClause.name) this.fc.visitTypeName(importClause.name);
        if (importClause.namedBindings) {
          this.visit(importClause.namedBindings);
        }
        break;
      case ts.SyntaxKind.NamespaceImport:
        var nsImport = <ts.NamespaceImport>node;
        this.emit('as');
        this.fc.visitTypeName(nsImport.name);
        break;
      case ts.SyntaxKind.NamedImports:
        this.emit('show');
        var used = this.filterImports((<ts.NamedImports>node).elements);
        if (used.length === 0) {
          this.reportError(node, 'internal error, used imports must not be empty');
        }
        this.visitList(used);
        break;
      case ts.SyntaxKind.NamedExports:
        var exportElements = (<ts.NamedExports>node).elements;
        this.emit('show');
        if (exportElements.length === 0) this.reportError(node, 'empty export list');
        this.visitList((<ts.NamedExports>node).elements);
        break;
      case ts.SyntaxKind.ImportSpecifier:
      case ts.SyntaxKind.ExportSpecifier:
        var spec = <ts.ImportOrExportSpecifier>node;
        if (spec.propertyName) {
          this.reportError(spec.propertyName, 'import/export renames are unsupported in Dart');
        }
        this.fc.visitTypeName(spec.name);
        break;
      case ts.SyntaxKind.ExportDeclaration:
        var exportDecl = <ts.ExportDeclaration>node;
        this.emit('export');
        if (exportDecl.moduleSpecifier) {
          this.visitExternalModuleReferenceExpr(exportDecl.moduleSpecifier);
        } else {
          this.reportError(node, 're-exports must have a module URL (export x from "./y").');
        }
        if (exportDecl.exportClause) this.visit(exportDecl.exportClause);
        this.emit(';');
        break;
      case ts.SyntaxKind.ImportEqualsDeclaration:
        var importEqDecl = <ts.ImportEqualsDeclaration>node;
        this.emit('import');
        this.visit(importEqDecl.moduleReference);
        this.emit('as');
        this.fc.visitTypeName(importEqDecl.name);
        this.emit(';');
        break;
      case ts.SyntaxKind.ExternalModuleReference:
        this.visitExternalModuleReferenceExpr((<ts.ExternalModuleReference>node).expression);
        break;

      default:
        return false;
    }
    return true;
  }

  private static isIgnoredImport(e: ts.ImportSpecifier) {
    // TODO: unify with facade_converter.ts
    var name = base.ident(e.name);
    switch (name) {
      case 'CONST':
      case 'CONST_EXPR':
      case 'normalizeBlank':
      case 'forwardRef':
      case 'ABSTRACT':
      case 'IMPLEMENTS':
        return true;
      default:
        return false;
    }
  }

  private visitExternalModuleReferenceExpr(expr: ts.Expression) {
    // TODO: what if this isn't a string literal?
    var moduleName = <ts.StringLiteral>expr;
    var text = moduleName.text;
    if (text.match(/^\.\//)) {
      // Strip './' to be more Dart-idiomatic.
      text = text.substring(2);
    } else if (!text.match(/^\.\.\//)) {
      // Unprefixed imports are package imports.
      text = 'package:' + text;
    }
    this.emit(JSON.stringify(text + '.dart'));
  }

  private isEmptyImport(n: ts.ImportDeclaration): boolean {
    var bindings = n.importClause.namedBindings;
    if (bindings.kind != ts.SyntaxKind.NamedImports) return false;
    var elements = (<ts.NamedImports>bindings).elements;
    // An import list being empty *after* filtering is ok, but if it's empty in the code itself,
    // it's nonsensical code, so probably a programming error.
    if (elements.length === 0) this.reportError(n, 'empty import list');
    return elements.every(ModuleTranspiler.isIgnoredImport);
  }

  private filterImports(ns: ts.ImportOrExportSpecifier[]) {
    return ns.filter((e) => !ModuleTranspiler.isIgnoredImport(e));
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
        .map((p) => ModuleTranspiler.DART_RESERVED_WORDS.indexOf(p) != -1 ? '_' + p : p)
        .join('.');
  }
}
