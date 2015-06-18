/// <reference path='../node_modules/typescript/bin/typescript.d.ts' />
import base = require('./base');
import ts = require('typescript');
import ts2dart = require('./main');

type CallHandler = (c: ts.CallExpression, context: ts.Expression) => void;
type PropertyHandler = (c: ts.PropertyAccessExpression) => void;

const FACADE_DEBUG = false;

export class FacadeConverter extends base.TranspilerBase {
  private tc: ts.TypeChecker;
  private candidateProperties: {[propertyName: string]: boolean} = {};

  constructor(transpiler: ts2dart.Transpiler) {
    super(transpiler);
    this.extractPropertyNames(this.callHandlers);
    this.extractPropertyNames(this.propertyHandlers);
  }

  private extractPropertyNames(m: ts.Map<ts.Map<any>>) {
    for (var fileName in m) {
      Object.keys(m[fileName])
          .filter((k) => m[fileName].hasOwnProperty(k))
          .map((propName) => propName.substring(propName.lastIndexOf('.') + 1))
          .forEach((propName) => this.candidateProperties[propName] = true);
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
      if (!this.candidateProperties.hasOwnProperty(ident)) return false;
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
      if (!this.candidateProperties.hasOwnProperty(ident)) return false;

      symbol = this.tc.getSymbolAtLocation(pa);
      if (FACADE_DEBUG) console.log('s:', symbol);

      // Error will be reported by PropertyAccess handling below.
      if (!symbol) return false;

      context = pa.expression;
    } else {
      // Not a call we recognize.
      return false;
    }

    var handler = this.getHandler(symbol, this.callHandlers);
    return handler && !handler(c, context);
  }

  handlePropertyAccess(pa: ts.PropertyAccessExpression): boolean {
    if (!this.tc) return;
    var ident = pa.name.text;
    if (!this.candidateProperties.hasOwnProperty(ident)) return false;
    var symbol = this.tc.getSymbolAtLocation(pa.name);
    if (!symbol) {
      this.reportMissingType(pa, ident);
      return false;
    }

    var handler = this.getHandler(symbol, this.propertyHandlers);
    return handler && !handler(pa);
  }

  private getHandler<T>(symbol: ts.Symbol, m: ts.Map<ts.Map<T>>): T {
    if (symbol.flags & ts.SymbolFlags.Alias) symbol = this.tc.getAliasedSymbol(symbol);
    if (!symbol.valueDeclaration) return null;

    var fileName = symbol.valueDeclaration.getSourceFile().fileName;
    fileName = this.getRelativeFileName(fileName);
    fileName = fileName.replace(/(\.d)?\.ts$/, '');

    if (FACADE_DEBUG) console.log('fn:', fileName);
    var fileSubs = m[fileName];
    if (!fileSubs) return null;
    var qn = this.tc.getFullyQualifiedName(symbol);
    // Function and Variable Qualified Names include their file name. Might be a bug in TypeScript,
    // for the time being just special case.
    if (symbol.flags & ts.SymbolFlags.Function || symbol.flags & ts.SymbolFlags.Variable) {
      qn = symbol.getName();
    }

    if (FACADE_DEBUG) console.log('qn', qn);
    return fileSubs[qn];
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

  private emitCall(name: string, args?: ts.Expression[]) {
    this.emit('.');
    this.emit(name);
    this.emit('(');
    if (args) this.visitList(args);
    this.emit(')');
  }

  private stdlibHandlers: ts.Map<CallHandler> = {
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

  private callHandlers: ts.Map<ts.Map<CallHandler>> = {
    'lib': this.stdlibHandlers,
    'lib.es6': this.stdlibHandlers,
    'angular2/src/facade/collection': {
      'Map': (c: ts.CallExpression, context: ts.Expression): boolean => {
        // The actual Map constructor is special cased for const calls.
        if (!this.isInsideConstExpr(c)) return true;
        if (c.arguments.length) {
          this.reportError(c, 'Arguments on a Map constructor in a const are unsupported');
        }
        if (c.typeArguments) {
          this.emit('<');
          this.visitList(c.typeArguments);
          this.emit('>');
        }
        this.emit('{ }');
        return false;
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

  private propertyHandlers: ts.Map<ts.Map<PropertyHandler>> = {
    'angular2/traceur-runtime': {
      'Map.size': (p: ts.PropertyAccessExpression) => {
        this.visit(p.expression);
        this.emit('.');
        this.emit('length');
      },
    },
  };
}
