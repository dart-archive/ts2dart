/// <reference path='../node_modules/typescript/bin/typescript.d.ts' />
import base = require('./base');
import ts = require('typescript');
import ts2dart = require('./main');

type FacadeHandler = (c: ts.CallExpression, context: ts.Expression) => void;

export class FacadeConverter extends base.TranspilerBase {
  private tc: ts.TypeChecker;
  private forbiddenNames: {[fileName: string]: boolean};

  constructor(transpiler: ts2dart.Transpiler) {
    super(transpiler);
    this.forbiddenNames = {};
    for (var fileName in this.subs) {
      Object.keys(this.subs[fileName])
          .map((fnName) => fnName.substring(fnName.lastIndexOf('.') + 1))
          .forEach((fnName) => this.forbiddenNames[fnName] = true);
    }
  }

  setTypeChecker(tc: ts.TypeChecker) { this.tc = tc; }

  maybeHandleCall(c: ts.CallExpression): boolean {
    if (!this.tc) return false;

    var symbol: ts.Symbol;
    var context: ts.Expression;

    if (c.expression.kind === ts.SyntaxKind.Identifier) {
      // Function call.
      symbol = this.tc.getSymbolAtLocation(c.expression);
      context = null;
    } else if (c.expression.kind === ts.SyntaxKind.PropertyAccessExpression) {
      // Method call.
      var pa = <ts.PropertyAccessExpression>c.expression;
      symbol = this.tc.getSymbolAtLocation(pa.name);
      context = pa.expression;
    } else {
      // Not a call we recognize.
      return false;
    }

    if (!symbol) {
      var ident = base.ident(c.expression);
      if (ident && this.forbiddenNames[ident]) this.reportMissingType(c, ident);
      return false;
    }

    if (symbol.flags & ts.SymbolFlags.Alias) symbol = this.tc.getAliasedSymbol(symbol);
    if (!symbol.valueDeclaration) return false;

    var fileName = symbol.valueDeclaration.getSourceFile().fileName;
    fileName = fileName.replace(/(\.d)?\.ts$/, '');

    // console.log('fn:', fileName);
    var fileSubs = this.subs[fileName];
    var qn = this.tc.getFullyQualifiedName(symbol);
    // Function Qualified Names include their file name. Might be a bug in TypeScript, for the
    // time being just special case.
    if (symbol.flags & ts.SymbolFlags.Function) qn = symbol.getName();

    // console.log('qn', qn);

    var qnSub = fileSubs[qn];
    if (!qnSub) return false;

    qnSub(c, context);
    return true;
  }

  private subs: ts.Map<ts.Map<FacadeHandler>> = {
    'lib': {
      'Array.push': (c: ts.CallExpression, context: ts.Expression) => {
        this.visit(context);
        this.emitCall('add', c.arguments);
      },
      'Array.map': (c: ts.CallExpression, context: ts.Expression) => {
        this.visit(context);
        this.emitCall('map', c.arguments);
        this.emitCall('toList');
      },
      'Array.forEach': (c: ts.CallExpression, context: ts.Expression) => {
        this.visit(context);
        this.emitCall('forEach', c.arguments);
        this.emitCall('toList');
      },
      'Array.slice': (c: ts.CallExpression, context: ts.Expression) => {
        this.emitCall('ListWrapper.slice', [context, ...c.arguments]);
      },
      'Array.splice': (c: ts.CallExpression, context: ts.Expression) => {
        this.emitCall('ListWrapper.splice', [context, ...c.arguments]);
      },
      'Array.concat': (c: ts.CallExpression, context: ts.Expression) => {
        this.emit('new List . from (');
        this.visit(context);
        this.emit(') .. addAll (');
        this.visit(c.arguments[0]);
        this.emit(')');
      },
      'Array.isArray': (c: ts.CallExpression, context: ts.Expression) => {
        this.visit(context);
        this.emit('is List');
      },
    },
    'angular2/traceur-runtime': {
      'Map.set': (c: ts.CallExpression, context: ts.Expression) => {
        this.visit(context);
        this.emit('[');
        this.visit(c.arguments[0]);
        this.emit(']');
        this.emit('=');
        this.visit(c.arguments[1]);
      },
      'Map.get': (c: ts.CallExpression, context: ts.Expression) => {
        this.visit(context);
        this.emit('[');
        this.visit(c.arguments[0]);
        this.emit(']');
      },
    },
    'angular2/src/facade/lang': {
      'CONST_EXPR': (c: ts.CallExpression, context: ts.Expression) => {
        // `const` keyword is emitted in the array literal handling, as it needs to be transitive.
        this.visitList(c.arguments);
      },
      'FORWARD_REF': (c: ts.CallExpression, context: ts.Expression) => {
        // The special function FORWARD_REF translates to an unwrapped value in Dart.
        const callback = <ts.FunctionExpression>c.arguments[0];
        if (callback.kind !== ts.SyntaxKind.ArrowFunction) {
          this.reportError(c, 'FORWARD_REF takes only arrow functions');
          return;
        }
        this.visit(callback.body);
      }
    },
  };

  private emitCall(name: string, args?: ts.Expression[]) {
    this.emit('.');
    this.emit(name);
    this.emit('(');
    if (args) this.visitList(args);
    this.emit(')');
  }

  checkPropertyAccess(pa: ts.PropertyAccessExpression) {
    if (!this.tc) return;
    var ident = pa.name.text;
    if (this.forbiddenNames[ident] && !this.tc.getSymbolAtLocation(pa.name)) {
      this.reportMissingType(pa, ident);
    }
  }

  reportMissingType(n: ts.Node, ident: string) {
    this.reportError(n, `Untyped property access to "${ident}" which could be special.\n` +
                            ` Please add type declarations to disambiguate.`);
  }

  isInsideConstExpr(node: ts.Node): boolean {
    return this.isConstCall(
        <ts.CallExpression>this.getAncestor(node, ts.SyntaxKind.CallExpression));
  }

  private isConstCall(node: ts.CallExpression): boolean {
    return node && base.ident(node.expression) === 'CONST_EXPR';
  }
}
