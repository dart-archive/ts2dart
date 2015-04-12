/// <reference path='../node_modules/typescript/bin/typescript.d.ts' />
import ts = require('typescript');
import ts2dart = require('./main');

export class TranspilerStep {
  constructor(private transpiler: ts2dart.Transpiler) {}

  visit(n: ts.Node) { this.transpiler.visit(n); }
  emit(s: string) { this.transpiler.emit(s); }
  emitNoSpace(s: string) { this.transpiler.emitNoSpace(s); }
  reportError(n: ts.Node, message: string) { this.transpiler.reportError(n, message); }

  visitNode(n: ts.Node): boolean { throw Error('not implemented'); }
}
