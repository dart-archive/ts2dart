/// <reference path='../node_modules/typescript/bin/typescript.d.ts' />
import ts = require('typescript');
import ts2dart = require('./main');

export function ident(n: ts.Node): string {
  if (n.kind === ts.SyntaxKind.Identifier) return (<ts.Identifier>n).text;
  if (n.kind === ts.SyntaxKind.QualifiedName) {
    var qname = (<ts.QualifiedName>n);
    var leftName = ident(qname.left);
    if (leftName) return leftName + '.' + ident(qname.right);
  }
  return null;
}

export class TranspilerStep {
  constructor(private transpiler: ts2dart.Transpiler) {}

  visit(n: ts.Node) { this.transpiler.visit(n); }
  emit(s: string) { this.transpiler.emit(s); }
  emitNoSpace(s: string) { this.transpiler.emitNoSpace(s); }
  reportError(n: ts.Node, message: string) { this.transpiler.reportError(n, message); }

  visitNode(n: ts.Node): boolean { throw Error('not implemented'); }

  visitEach(nodes: ts.Node[]) { this.transpiler.visitEach(nodes); }
  visitEachIfPresent(nodes?: ts.Node[]) { this.transpiler.visitEachIfPresent(nodes); }
  visitList(nodes: ts.Node[], separator: string = ',') {
    this.transpiler.visitList(nodes, separator);
  }

  // TODO(martinprobst): This belonds to module.ts, refactor.
  getLibraryName(): string { return this.transpiler.getLibraryName(); }

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
    var identifier = ident(typeName);
    var translated = TranspilerStep.DART_TYPES[identifier] || identifier;
    this.emit(translated);
  }

  hasAncestor(n: ts.Node, kind: ts.SyntaxKind): boolean {
    return this.transpiler.hasAncestor(n, kind);
  }
  hasAnnotation(decorators: ts.NodeArray<ts.Decorator>, name: string): boolean {
    return this.transpiler.hasAnnotation(decorators, name);
  }
  hasFlag(n: {flags: number}, flag: ts.NodeFlags): boolean {
    return this.transpiler.hasFlag(n, flag);
  }
}
