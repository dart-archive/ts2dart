/// <reference path='../node_modules/typescript/bin/typescript.d.ts' />
import base = require('./base');
import ts = require('typescript');
import ts2dart = require('./main');

type FacadeHandler = (c: ts.CallExpression, context: ts.Expression) => void;

const FACADE_DEBUG = false;

export class FacadeConverter extends base.TranspilerBase {
  private tc: ts.TypeChecker;
  private candidateMethods: {[fileName: string]: boolean};

  constructor(transpiler: ts2dart.Transpiler) {
    super(transpiler);
    this.candidateMethods = {};
    for (var fileName in this.subs) {
      Object.keys(this.subs[fileName])
          .filter((k) => this.subs[fileName].hasOwnProperty(k))
          .map((fnName) => fnName.substring(fnName.lastIndexOf('.') + 1))
          .forEach((fnName) => this.candidateMethods[fnName] = true);
    }
  }

  setTypeChecker(tc: ts.TypeChecker) { this.tc = tc; }

  maybeHandleCall(c: ts.CallExpression): boolean {
    if (!this.tc) return false;

    var symbol: ts.Symbol;
    var context: ts.Expression;
    var ident: string;

    if (c.expression.kind === ts.SyntaxKind.Identifier) {
      // Function call.
      ident = base.ident(c.expression);
      if (!this.candidateMethods.hasOwnProperty(ident)) return false;
      symbol = this.tc.getSymbolAtLocation(c.expression);
      if (FACADE_DEBUG) console.log('s:', symbol);

      if (!symbol) {
        this.reportMissingType(c, ident);
        return false;
      }

      context = null;
    } else if (c.expression.kind === ts.SyntaxKind.PropertyAccessExpression) {
      // Method call.
      var pa = <ts.PropertyAccessExpression>c.expression;
      ident = base.ident(pa.name);
      if (!this.candidateMethods.hasOwnProperty(ident)) return false;

      symbol = this.tc.getSymbolAtLocation(pa);
      if (FACADE_DEBUG) console.log('s:', symbol);

      // Error will be reported by PropertyAccess handling below.
      if (!symbol) return false;

      context = pa.expression;
    } else {
      // Not a call we recognize.
      return false;
    }

    if (symbol.flags & ts.SymbolFlags.Alias) symbol = this.tc.getAliasedSymbol(symbol);
    if (!symbol.valueDeclaration) return false;

    var fileName = symbol.valueDeclaration.getSourceFile().fileName;
    fileName = this.getRelativeFileName(fileName);
    fileName = fileName.replace(/(\.d)?\.ts$/, '');

    if (FACADE_DEBUG) console.log('fn:', fileName);
    var fileSubs = this.subs[fileName];
    if (!fileSubs) return false;
    var qn = this.tc.getFullyQualifiedName(symbol);
    // Function Qualified Names include their file name. Might be a bug in TypeScript, for the
    // time being just special case.
    if (symbol.flags & ts.SymbolFlags.Function) qn = symbol.getName();

    if (FACADE_DEBUG) console.log('qn', qn);
    var qnSub = fileSubs[qn];
    if (!qnSub) return false;

    if (qnSub(c, context)) return false; // true ==> not handled.
    return true;
  }

  private stdlibSubs: ts.Map<FacadeHandler> = {
    'Array.push': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      this.emitCall('add', c.arguments);
    },
    'Array.pop': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      this.emitCall('removeLast');
    },
    'Array.map': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      this.emitCall('map', c.arguments);
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
    'ArrayConstructor.isArray': (c: ts.CallExpression, context: ts.Expression) => {
      this.emit('( (');
      this.visitList(c.arguments);  // Should only be 1.
      this.emit(')');
      this.emit('is List');
      this.emit(')');
    },
    'RegExp.test': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      this.emitCall('hasMatch', c.arguments);
    },
    'RegExp.exec': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      this.emitCall('allMatches', c.arguments);
      this.emitCall('toList');
    },
  };

  private subs: ts.Map<ts.Map<FacadeHandler>> = {
    'lib': this.stdlibSubs,
    'lib.es6': this.stdlibSubs,
    'angular2/traceur-runtime': {
      'Map': (c: ts.CallExpression, context: ts.Expression): boolean => {
        // The actual Map constructor is special cased for const calls.
        if (!this.isInsideConstExpr(c)) return true;
        if (c.typeArguments) {
          this.reportError(c, 'Type arguments on a Map constructor in a const are unsupported');
        }
        this.emit('{ }');
        return false;
      },
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
      'Map.has': (c: ts.CallExpression, context: ts.Expression) => {
        this.visit(context);
        this.emitCall('containsKey', c.arguments);
      },
    },
    'angular2/src/di/forward_ref': {
      'forwardRef': (c: ts.CallExpression, context: ts.Expression) => {
        // The special function forwardRef translates to an unwrapped value in Dart.
        const callback = <ts.FunctionExpression>c.arguments[0];
        if (callback.kind !== ts.SyntaxKind.ArrowFunction) {
          this.reportError(c, 'forwardRef takes only arrow functions');
          return;
        }
        this.visit(callback.body);
      },
    },
    'angular2/src/facade/lang': {
      'CONST_EXPR': (c: ts.CallExpression, context: ts.Expression) => {
        // `const` keyword is emitted in the array literal handling, as it needs to be transitive.
        this.visitList(c.arguments);
      },
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
    if (this.candidateMethods.hasOwnProperty(ident) && !this.tc.getSymbolAtLocation(pa)) {
      this.reportMissingType(pa, ident);
    }
  }

  reportMissingType(n: ts.Node, ident: string) {
    this.reportError(n, `Untyped property access to "${ident}" which could be ` +
                            `a special ts2dart builtin. ` +
                            `Please add type declarations to disambiguate.`);
  }

  isInsideConstExpr(node: ts.Node): boolean {
    return this.isConstCall(
        <ts.CallExpression>this.getAncestor(node, ts.SyntaxKind.CallExpression));
  }

  private isConstCall(node: ts.CallExpression): boolean {
    return node && base.ident(node.expression) === 'CONST_EXPR';
  }
}
