import * as ts from 'typescript';
import * as base from './base';
import {Transpiler} from './main';
import {FacadeConverter} from './facade_converter';

export default class ModuleTranspiler extends base.TranspilerBase {
  constructor(tr: Transpiler, private fc: FacadeConverter, private generateLibraryName: boolean) {
    super(tr);
  }

  visitNode(node: ts.Node): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.SourceFile:
        let sf = <ts.SourceFile>node;
        if (this.generateLibraryName) {
          this.emit('library');
          this.emit(this.getLibraryName(sf.fileName));
          this.emit(';');
        }
        this.fc.emitExtraImports(sf);
        ts.forEachChild(sf, this.visit.bind(this));
        break;
      case ts.SyntaxKind.EndOfFileToken:
        ts.forEachChild(node, this.visit.bind(this));
        break;
      case ts.SyntaxKind.ImportDeclaration:
        let importDecl = <ts.ImportDeclaration>node;
        if (importDecl.importClause) {
          if (this.isEmptyImport(importDecl)) return true;
          this.emit('import');
          this.visitExternalModuleReferenceExpr(importDecl.moduleSpecifier);
          this.visit(importDecl.importClause);
        } else {
          this.reportError(importDecl, 'bare import is unsupported');
        }
        this.emit(';');
        break;
      case ts.SyntaxKind.ImportClause:
        let importClause = <ts.ImportClause>node;
        if (importClause.name) this.fc.visitTypeName(importClause.name);
        if (importClause.namedBindings) {
          this.visit(importClause.namedBindings);
        }
        break;
      case ts.SyntaxKind.NamespaceImport:
        let nsImport = <ts.NamespaceImport>node;
        this.emit('as');
        this.fc.visitTypeName(nsImport.name);
        break;
      case ts.SyntaxKind.NamedImports:
        this.emit('show');
        let used = this.filterImports((<ts.NamedImports>node).elements);
        if (used.length === 0) {
          this.reportError(node, 'internal error, used imports must not be empty');
        }
        this.visitList(used);
        break;
      case ts.SyntaxKind.NamedExports:
        let exportElements = (<ts.NamedExports>node).elements;
        this.emit('show');
        if (exportElements.length === 0) this.reportError(node, 'empty export list');
        this.visitList((<ts.NamedExports>node).elements);
        break;
      case ts.SyntaxKind.ImportSpecifier:
      case ts.SyntaxKind.ExportSpecifier:
        let spec = <ts.ImportOrExportSpecifier>node;
        if (spec.propertyName) {
          this.reportError(spec.propertyName, 'import/export renames are unsupported in Dart');
        }
        this.fc.visitTypeName(spec.name);
        break;
      case ts.SyntaxKind.ExportDeclaration:
        let exportDecl = <ts.ExportDeclaration>node;
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
        let importEqDecl = <ts.ImportEqualsDeclaration>node;
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
    let name = base.ident(e.name);
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
    let moduleName = <ts.StringLiteral>expr;
    let text = moduleName.text;
    if (text.match(/^\.\//)) {
      // Strip './' to be more Dart-idiomatic.
      text = text.substring(2);
    } else if (!text.match(/^\.\.\//)) {
      // Replace '@angular' with 'angular2' for Dart.
      text = text.replace(/^@angular\//, 'angular2/');
      // Unprefixed/absolute imports are package imports.
      text = 'package:' + text;
    }
    this.emit(JSON.stringify(text + '.dart'));
  }

  private isEmptyImport(n: ts.ImportDeclaration): boolean {
    let bindings = n.importClause.namedBindings;
    if (bindings.kind !== ts.SyntaxKind.NamedImports) return false;
    let elements = (<ts.NamedImports>bindings).elements;
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
       'finally for if in is new null rethrow return super switch this throw true try let void ' +
       'while with')
          .split(/ /);

  getLibraryName(fileName: string) {
    fileName = this.getRelativeFileName(fileName);
    let parts = fileName.split('/');
    return parts.filter((p) => p.length > 0)
        .map((p) => p.replace(/[^\w.]/g, '_'))
        .map((p) => p.replace(/\.[jt]s$/g, ''))
        .map((p) => ModuleTranspiler.DART_RESERVED_WORDS.indexOf(p) !== -1 ? '_' + p : p)
        .join('.');
  }
}
