/// <reference path='../node_modules/typescript/bin/typescript.d.ts' />
import ts = require('typescript');
import base = require('./base');
import ts2dart = require('./main');

class ImportExportTranspiler extends base.TranspilerStep {
  constructor(tr: ts2dart.Transpiler, private generateLibraryName: boolean) { super(tr); }

  visitNode(node: ts.Node): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.SourceFile:
        if (this.generateLibraryName) {
          this.emit('library');
          this.emit(this.getLibraryName());
          this.emit(';');
        }
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
        if (importClause.name) this.visitTypeName(importClause.name);
        if (importClause.namedBindings) {
          this.visit(importClause.namedBindings);
        }
        break;
      case ts.SyntaxKind.NamespaceImport:
        var nsImport = <ts.NamespaceImport>node;
        this.emit('as');
        this.visitTypeName(nsImport.name);
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
        this.emit('show');
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
        this.visitTypeName(importEqDecl.name);
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
    var name = base.ident(e.name);
    switch (name) {
      case 'CONST':
      case 'CONST_EXPR':
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
    moduleName.text = text + '.dart';
    this.visit(expr);
  }

  private isEmptyImport(n: ts.ImportDeclaration): boolean {
    var bindings = n.importClause.namedBindings;
    if (bindings.kind != ts.SyntaxKind.NamedImports) return false;
    return (<ts.NamedImports>bindings).elements.every(ImportExportTranspiler.isIgnoredImport);
  }

  private filterImports(ns: ts.ImportOrExportSpecifier[]) {
    return ns.filter((e) => !ImportExportTranspiler.isIgnoredImport(e));
  }
}

export = ImportExportTranspiler;
