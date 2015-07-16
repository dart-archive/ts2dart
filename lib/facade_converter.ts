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
  private candidateTypes: {[typeName: string]: boolean} = {};

  constructor(transpiler: ts2dart.Transpiler) {
    super(transpiler);
    this.extractPropertyNames(this.callHandlers);
    this.extractPropertyNames(this.propertyHandlers);
    this.extractPropertyNames(this.TS_TO_DART_TYPENAMES, this.candidateTypes);
  }

  private extractPropertyNames(m: ts.Map<ts.Map<any>>,
                               candidates: {[k: string]: boolean} = this.candidateProperties) {
    for (var fileName in m) {
      Object.keys(m[fileName])
          .filter((k) => m[fileName].hasOwnProperty(k))
          .map((propName) => propName.substring(propName.lastIndexOf('.') + 1))
          .forEach((propName) => candidates[propName] = true);
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

  buildImports(sourceFile: ts.SourceFile) {
    var imports: {[type: string]: boolean} = {};

    function getNodes(sourceFile: ts.SourceFile): ts.Node[] {
      var nodes: ts.Node[] = [];
      function allNodes(n: ts.Node){ts.forEachChild(n, n => {
        nodes.push(n);
        allNodes(n);
        return false;
      })};
      allNodes(sourceFile);
      return nodes;
    }

    var types = getNodes(sourceFile)
                    .filter(n => n.kind === ts.SyntaxKind.TypeReference)
                    .map(n => base.ident((<ts.TypeReferenceNode>n).typeName));


    for (var iType in types) {
      var type = types[iType];
      if (this.TS_TO_DART_TYPE_IMPORTS[type]) {
        imports[this.TS_TO_DART_TYPE_IMPORTS[type]] = true;
      }
    }
    for (var imp in imports) {
      this.emit('import "' + imp + '";');
    }
  }

  visitTypeName(typeName: ts.EntityName) {
    if (typeName.kind !== ts.SyntaxKind.Identifier) {
      this.visit(typeName);
      return;
    }
    var ident = base.ident(typeName);
    if (this.candidateTypes.hasOwnProperty(ident) && this.tc) {
      var symbol = this.tc.getSymbolAtLocation(typeName);
      if (!symbol) {
        this.reportMissingType(typeName, ident);
        return;
      }
      let fileAndName = this.getFileAndName(symbol);
      if (fileAndName) {
        var fileSubs = this.TS_TO_DART_TYPENAMES[fileAndName.fileName];
        if (fileSubs && fileSubs.hasOwnProperty(fileAndName.qname)) {
          this.emit(fileSubs[fileAndName.qname]);
          return;
        }
      }
    }
    this.emit(ident);
  }

  private getHandler<T>(symbol: ts.Symbol, m: ts.Map<ts.Map<T>>): T {
    var {fileName, qname} = this.getFileAndName(symbol);
    var fileSubs = m[fileName];
    if (!fileSubs) return null;
    return fileSubs[qname];
  }

  private getFileAndName(symbol: ts.Symbol): {fileName: string, qname: string} {
    while (symbol.flags & ts.SymbolFlags.Alias) symbol = this.tc.getAliasedSymbol(symbol);
    let decl = symbol.valueDeclaration;
    if (!decl) {
      // In the case of a pure declaration with no assignment, there is no value declared.
      // Just grab the first declaration, hoping it is declared once.
      decl = symbol.declarations[0];
    }

    var fileName = decl.getSourceFile().fileName;
    fileName = this.getRelativeFileName(fileName);
    fileName = fileName.replace(/(\.d)?\.ts$/, '');

    if (FACADE_DEBUG) console.log('fn:', fileName);
    var qname = this.tc.getFullyQualifiedName(symbol);
    // Some Qualified Names include their file name. Might be a bug in TypeScript,
    // for the time being just special case.
    if (symbol.flags & ts.SymbolFlags.Function || symbol.flags & ts.SymbolFlags.Variable ||
        symbol.flags & ts.SymbolFlags.Class) {
      qname = symbol.getName();
    }
    if (FACADE_DEBUG) console.log('qn:', qname);
    return {fileName, qname};
  }

  private isNamedType(node: ts.Node, fileName: string, qname: string): boolean {
    var symbol = this.tc.getTypeAtLocation(node).getSymbol();
    if (!symbol) return false;
    var actual = this.getFileAndName(symbol);
    if (fileName === 'lib' && !(actual.fileName === 'lib' || actual.fileName === 'lib.es6')) {
      return false;
    } else {
      if (fileName !== actual.fileName) return false;
    }
    return qname === actual.qname;
  }

  private reportMissingType(n: ts.Node, ident: string) {
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

  private stdlibTypeReplacements: ts.Map<string> = {
    'Date': 'DateTime',
    'Array': 'List',
    'XMLHttpRequest': 'HttpRequest',

    // Dart has two different incompatible DOM APIs
    // https://github.com/angular/angular/issues/2770
    'Node': 'dynamic',
    'Text': 'dynamic',
    'Element': 'dynamic',
    'Event': 'dynamic',
    'HTMLElement': 'dynamic',
    'HTMLAnchorElement': 'dynamic',
    'HTMLStyleElement': 'dynamic',
    'HTMLInputElement': 'dynamic',
    'HTMLDocument': 'dynamic',
    'History': 'dynamic',
    'Location': 'dynamic',
  };

  private TS_TO_DART_TYPE_IMPORTS: ts.Map<string> = {'XMLHttpRequest': 'dart:html'};

  private TS_TO_DART_TYPENAMES: ts.Map<ts.Map<string>> = {
    'lib': this.stdlibTypeReplacements,
    'lib.es6': this.stdlibTypeReplacements,
    'angular2/src/facade/async':
        {'Promise': 'Future', 'Observable': 'Stream', 'ObservableController': 'StreamController'},
    'angular2/src/facade/collection': {'StringMap': 'Map'},
    'angular2/src/facade/lang': {'Date': 'DateTime'},
    'angular2/globals': {'StringMap': 'Map'},
  };

  private stdlibHandlers: ts.Map<CallHandler> = {
    'Array.push': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      this.emitCall('add', c.arguments);
    },
    'Array.pop': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      this.emitCall('removeLast');
    },
    'Array.shift': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      this.emit('. removeAt ( 0 )');
    },
    'Array.unshift': (c: ts.CallExpression, context: ts.Expression) => {
      this.emit('(');
      this.visit(context);
      if (c.arguments.length == 1) {
        this.emit('.. insert ( 0,');
        this.visit(c.arguments[0]);
        this.emit(') ) . length');
      } else {
        this.emit('.. insertAll ( 0, [');
        this.visitList(c.arguments);
        this.emit(']) ) . length');
      }
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
      this.emit(')');
      c.arguments.forEach(arg => {
        if (!this.isNamedType(arg, 'lib', 'Array')) {
          this.reportError(arg, 'Array.concat only takes Array arguments');
        }
        this.emit('.. addAll (');
        this.visit(arg);
        this.emit(')');
      });
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
      'Map.delete': (c: ts.CallExpression, context: ts.Expression) => {
        // JS Map.delete(k) returns whether k was present in the map,
        // convert to:
        // (Map.containsKey(k) && (Map.remove(k) != null || true))
        // (Map.remove(k) != null || true) is required to always returns true
        // when Map.containsKey(k)
        this.emit('(');
        this.visit(context);
        this.emitCall('containsKey', c.arguments);
        this.emit('&& (');
        this.visit(context);
        this.emitCall('remove', c.arguments);
        this.emit('!= null || true ) )');
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
