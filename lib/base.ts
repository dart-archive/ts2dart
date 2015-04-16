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
      var decName = ident(d.expression);
      if (decName === name) return true;
      if (d.expression.kind !== ts.SyntaxKind.CallExpression) return false;
      var callExpr = (<ts.CallExpression>d.expression);
      decName = ident(callExpr.expression);
      return decName === name;
    });
  }

  hasFlag(n: {flags: number}, flag: ts.NodeFlags): boolean {
    return n && (n.flags & flag) !== 0 || false;
  }

  // TODO(martinprobst): This belongs to module.ts, refactor.
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
    identifier = identifier.replace(/(.+)Annotation$/, '$1');
    var translated = TranspilerStep.DART_TYPES[identifier] || identifier;
    this.emit(translated);
  }
}
