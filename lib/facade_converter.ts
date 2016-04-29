import * as base from './base';
import * as ts from 'typescript';
import * as path from 'path';
import {Transpiler} from './main';

type CallHandler = (c: ts.CallExpression, context: ts.Expression) => void;
type PropertyHandler = (c: ts.PropertyAccessExpression) => void;
type Set = {
  [s: string]: boolean
};

const FACADE_DEBUG = false;

const DEFAULT_LIB_MARKER = '__ts2dart_default_lib';
const PROVIDER_IMPORT_MARKER = '__ts2dart_has_provider_import';
const TS2DART_PROVIDER_COMMENT = '@ts2dart_Provider';

function merge(...args: {[key: string]: any}[]): {[key: string]: any} {
  let returnObject: {[key: string]: any} = {};
  for (let arg of args) {
    for (let key of Object.getOwnPropertyNames(arg)) {
      returnObject[key] = arg[key];
    }
  }
  return returnObject;
}

export class FacadeConverter extends base.TranspilerBase {
  private tc: ts.TypeChecker;
  private defaultLibLocation: string;
  private candidateProperties: {[propertyName: string]: boolean} = {};
  private candidateTypes: {[typeName: string]: boolean} = {};
  private genericMethodDeclDepth = 0;

  constructor(transpiler: Transpiler) {
    super(transpiler);

    this.extractPropertyNames(this.callHandlers, this.candidateProperties);
    this.extractPropertyNames(this.propertyHandlers, this.candidateProperties);
    this.extractPropertyNames(this.tsToDartTypeNames, this.candidateTypes);
  }

  initializeTypeBasedConversion(
      tc: ts.TypeChecker, opts: ts.CompilerOptions, host: ts.CompilerHost) {
    this.tc = tc;
    this.defaultLibLocation = ts.getDefaultLibFilePath(opts).replace(/\.d\.ts$/, '');
    this.resolveModuleNames(opts, host, this.callHandlers);
    this.resolveModuleNames(opts, host, this.propertyHandlers);
    this.resolveModuleNames(opts, host, this.tsToDartTypeNames);
    this.resolveModuleNames(opts, host, this.callHandlerReplaceNew);
  }

  private extractPropertyNames(m: ts.Map<ts.Map<any>>, candidates: {[k: string]: boolean}) {
    for (let fileName of Object.keys(m)) {
      const file = m[fileName];
      Object.keys(file)
          .map((propName) => propName.substring(propName.lastIndexOf('.') + 1))
          .forEach((propName) => candidates[propName] = true);
    }
  }

  private resolveModuleNames(
      opts: ts.CompilerOptions, host: ts.CompilerHost, m: ts.Map<ts.Map<any>>) {
    for (let mn of Object.keys(m)) {
      let actual: string;
      let absolute: string;
      if (mn === DEFAULT_LIB_MARKER) {
        actual = this.defaultLibLocation;
      } else {
        let resolved = ts.resolveModuleName(mn, '', opts, host);
        if (!resolved.resolvedModule) continue;
        actual = resolved.resolvedModule.resolvedFileName.replace(/(\.d)?\.ts$/, '');
        // TypeScript's resolution returns relative paths here, but uses absolute ones in
        // SourceFile.fileName later. Make sure to hit both use cases.
        absolute = path.resolve(actual);
      }
      if (FACADE_DEBUG) console.log('Resolved module', mn, '->', actual);
      m[actual] = m[mn];
      if (absolute) m[absolute] = m[mn];
    }
  }

  /**
   * To avoid strongly referencing the Provider class (which could bloat binary size), Angular 2
   * write providers as object literals. However the Dart transformers don't recognize this, so
   * ts2dart translates the special syntax `/* @ts2dart_Provider * / {provide: Class, param1: ...}`
   * into `const Provider(Class, param1: ...)`.
   */
  maybeHandleProvider(ole: ts.ObjectLiteralExpression): boolean {
    if (!this.hasMarkerComment(ole, TS2DART_PROVIDER_COMMENT)) return false;
    let classParam: ts.Expression;
    let remaining = ole.properties.filter((e) => {
      if (e.kind !== ts.SyntaxKind.PropertyAssignment) {
        this.reportError(e, TS2DART_PROVIDER_COMMENT + ' elements must be property assignments');
      }
      if ('provide' === base.ident(e.name)) {
        classParam = (e as ts.PropertyAssignment).initializer;
        return false;
      }
      return true;  // include below.
    });

    if (!classParam) {
      this.reportError(ole, 'missing provide: element');
      return false;
    }

    this.emit('const Provider(');
    this.visit(classParam);
    if (remaining.length > 0) {
      this.emit(',');
      for (let i = 0; i < remaining.length; i++) {
        let e = remaining[i];
        if (e.kind !== ts.SyntaxKind.PropertyAssignment) this.visit(e.name);
        this.emit(base.ident(e.name));
        this.emit(':');
        this.visit((e as ts.PropertyAssignment).initializer);
        if ((i + 1) < remaining.length) this.emit(',');
      }
      this.emit(')');
    }
    return true;
  }

  maybeHandleCall(c: ts.CallExpression): boolean {
    if (!this.tc) return false;
    let {context, symbol} = this.getCallInformation(c);
    if (!symbol) {
      // getCallInformation returns a symbol if we understand this call.
      return false;
    }
    let handler = this.getHandler(c, symbol, this.callHandlers);
    return handler && !handler(c, context);
  }

  handlePropertyAccess(pa: ts.PropertyAccessExpression): boolean {
    if (!this.tc) return;
    let ident = pa.name.text;
    if (!this.candidateProperties.hasOwnProperty(ident)) return false;
    let symbol = this.tc.getSymbolAtLocation(pa.name);
    if (!symbol) {
      this.reportMissingType(pa, ident);
      return false;
    }

    let handler = this.getHandler(pa, symbol, this.propertyHandlers);
    return handler && !handler(pa);
  }

  /**
   * Searches for type references that require extra imports and emits the imports as necessary.
   */
  emitExtraImports(sourceFile: ts.SourceFile) {
    let libraries = <ts.Map<string>>{
      'XMLHttpRequest': 'dart:html',
      'KeyboardEvent': 'dart:html',
      'Uint8Array': 'dart:typed_arrays',
      'ArrayBuffer': 'dart:typed_arrays',
      'Promise': 'dart:async',
    };
    let emitted: Set = {};
    this.emitImports(sourceFile, libraries, emitted, sourceFile);
  }

  private emitImports(
      n: ts.Node, libraries: ts.Map<string>, emitted: Set, sourceFile: ts.SourceFile): void {
    if (n.kind === ts.SyntaxKind.TypeReference) {
      let type = base.ident((<ts.TypeReferenceNode>n).typeName);
      if (libraries.hasOwnProperty(type)) {
        let toEmit = libraries[type];
        if (!emitted[toEmit]) {
          this.emit(`import "${toEmit}";`);
          emitted[toEmit] = true;
        }
      }
    }

    // Support for importing "Provider" in case /* @ts2dart_Provider */ comments are present.
    if (n.kind === ts.SyntaxKind.ImportDeclaration) {
      // See if there is already code importing 'Provider' from angular2/core.
      let id = n as ts.ImportDeclaration;
      if ((id.moduleSpecifier as ts.StringLiteral).text === 'angular2/core') {
        if (id.importClause.namedBindings.kind === ts.SyntaxKind.NamedImports) {
          let ni = id.importClause.namedBindings as ts.NamedImports;
          for (let nb of ni.elements) {
            if (base.ident(nb.name) === 'Provider') {
              emitted[PROVIDER_IMPORT_MARKER] = true;
              break;
            }
          }
        }
      }
    }

    if (!emitted[PROVIDER_IMPORT_MARKER] && this.hasMarkerComment(n, TS2DART_PROVIDER_COMMENT)) {
      // if 'Provider' has not been imported yet, and there's a @ts2dart_Provider, add it.
      this.emit(`import "package:angular2/core.dart" show Provider;`);
      emitted[PROVIDER_IMPORT_MARKER] = true;
    }

    n.getChildren(sourceFile)
        .forEach((child: ts.Node) => this.emitImports(child, libraries, emitted, sourceFile));
  }

  pushTypeParameterNames(n: ts.FunctionLikeDeclaration) {
    if (!n.typeParameters) return;
    this.genericMethodDeclDepth++;
  }

  popTypeParameterNames(n: ts.FunctionLikeDeclaration) {
    if (!n.typeParameters) return;
    this.genericMethodDeclDepth--;
  }

  resolvePropertyTypes(tn: ts.TypeNode): ts.Map<ts.PropertyDeclaration> {
    let res: ts.Map<ts.PropertyDeclaration> = {};
    if (!tn || !this.tc) return res;

    let t = this.tc.getTypeAtLocation(tn);
    for (let sym of this.tc.getPropertiesOfType(t)) {
      let decl = sym.valueDeclaration || (sym.declarations && sym.declarations[0]);
      if (decl.kind !== ts.SyntaxKind.PropertyDeclaration &&
          decl.kind !== ts.SyntaxKind.PropertySignature) {
        let msg = this.tc.getFullyQualifiedName(sym) +
            ' used for named parameter definition must be a property';
        this.reportError(decl, msg);
        continue;
      }
      res[sym.name] = <ts.PropertyDeclaration>decl;
    }
    return res;
  }

  /**
   * The Dart Development Compiler (DDC) has a syntax extension that uses comments to emulate
   * generic methods in Dart. ts2dart has to hack around this and keep track of which type names
   * in the current scope are actually DDC type parameters and need to be emitted in comments.
   *
   * TODO(martinprobst): Remove this once the DDC hack has made it into Dart proper.
   */
  private isGenericMethodTypeParameterName(name: ts.EntityName): boolean {
    // Avoid checking this unless needed.
    if (this.genericMethodDeclDepth === 0 || !this.tc) return false;
    // Check if the type of the name is a TypeParameter.
    let t = this.tc.getTypeAtLocation(name);
    if (!t || (t.flags & ts.TypeFlags.TypeParameter) === 0) return false;

    // Check if the symbol we're looking at is the type parameter.
    let symbol = this.tc.getSymbolAtLocation(name);
    if (symbol !== t.symbol) return false;

    // Check that the Type Parameter has been declared by a function declaration.
    return symbol.declarations.some(d => d.parent.kind === ts.SyntaxKind.FunctionDeclaration);
  }

  visitTypeName(typeName: ts.EntityName) {
    if (typeName.kind !== ts.SyntaxKind.Identifier) {
      this.visit(typeName);
      return;
    }
    let ident = base.ident(typeName);
    if (this.isGenericMethodTypeParameterName(typeName)) {
      // DDC generic methods hack - all names that are type parameters to generic methods have to be
      // emitted in comments.
      this.emit('dynamic/*=');
      this.emit(ident);
      this.emit('*/');
      return;
    }

    if (this.candidateTypes.hasOwnProperty(ident) && this.tc) {
      let symbol = this.tc.getSymbolAtLocation(typeName);
      if (!symbol) {
        this.reportMissingType(typeName, ident);
        return;
      }
      let fileAndName = this.getFileAndName(typeName, symbol);
      if (fileAndName) {
        let fileSubs = this.tsToDartTypeNames[fileAndName.fileName];
        if (fileSubs && fileSubs.hasOwnProperty(fileAndName.qname)) {
          this.emit(fileSubs[fileAndName.qname]);
          return;
        }
      }
    }
    this.emit(ident);
  }

  shouldEmitNew(c: ts.CallExpression): boolean {
    if (!this.tc) return true;

    let ci = this.getCallInformation(c);
    let symbol = ci.symbol;
    // getCallInformation returns a symbol if we understand this call.
    if (!symbol) return true;

    let loc = this.getFileAndName(c, symbol);
    if (!loc) return true;
    let {fileName, qname} = loc;
    let fileSubs = this.callHandlerReplaceNew[fileName];
    if (!fileSubs) return true;
    return !fileSubs[qname];
  }

  private getCallInformation(c: ts.CallExpression): {context?: ts.Expression, symbol?: ts.Symbol} {
    let symbol: ts.Symbol;
    let context: ts.Expression;
    let ident: string;
    let expr = c.expression;

    if (expr.kind === ts.SyntaxKind.Identifier) {
      // Function call.
      ident = base.ident(expr);
      if (!this.candidateProperties.hasOwnProperty(ident)) return {};
      symbol = this.tc.getSymbolAtLocation(expr);

      if (!symbol) {
        this.reportMissingType(c, ident);
        return {};
      }

      context = null;
    } else if (expr.kind === ts.SyntaxKind.PropertyAccessExpression) {
      // Method call.
      let pa = <ts.PropertyAccessExpression>expr;
      ident = base.ident(pa.name);
      if (!this.candidateProperties.hasOwnProperty(ident)) return {};

      symbol = this.tc.getSymbolAtLocation(pa);

      // Error will be reported by PropertyAccess handling below.
      if (!symbol) return {};

      context = pa.expression;
    }
    return {context, symbol};
  }

  private getHandler<T>(n: ts.Node, symbol: ts.Symbol, m: ts.Map<ts.Map<T>>): T {
    let loc = this.getFileAndName(n, symbol);
    if (!loc) return null;
    let {fileName, qname} = loc;
    let fileSubs = m[fileName];
    if (!fileSubs) return null;
    return fileSubs[qname];
  }

  private getFileAndName(n: ts.Node, originalSymbol: ts.Symbol): {fileName: string, qname: string} {
    let symbol = originalSymbol;
    while (symbol.flags & ts.SymbolFlags.Alias) symbol = this.tc.getAliasedSymbol(symbol);
    let decl = symbol.valueDeclaration;
    if (!decl) {
      // In the case of a pure declaration with no assignment, there is no value declared.
      // Just grab the first declaration, hoping it is declared once.
      if (!symbol.declarations || symbol.declarations.length === 0) {
        this.reportError(n, 'no declarations for symbol ' + originalSymbol.name);
        return null;
      }
      decl = symbol.declarations[0];
    }

    const canonicalFileName = decl.getSourceFile().fileName.replace(/(\.d)?\.ts$/, '');

    let qname = this.tc.getFullyQualifiedName(symbol);
    // Some Qualified Names include their file name. Might be a bug in TypeScript,
    // for the time being just special case.
    if (symbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Function | ts.SymbolFlags.Variable)) {
      qname = symbol.getName();
    }
    if (FACADE_DEBUG) console.error('cfn:', canonicalFileName, 'qn:', qname);
    return {fileName: canonicalFileName, qname};
  }

  private isNamedDefaultLibType(node: ts.Node, qname: string): boolean {
    let symbol = this.tc.getTypeAtLocation(node).getSymbol();
    if (!symbol) return false;
    let actual = this.getFileAndName(node, symbol);
    return actual.fileName === this.defaultLibLocation && qname === actual.qname;
  }

  private reportMissingType(n: ts.Node, ident: string) {
    this.reportError(
        n, `Untyped property access to "${ident}" which could be ` + `a special ts2dart builtin. ` +
            `Please add type declarations to disambiguate.`);
  }

  private static DECLARATIONS: {[k: number]: boolean} = {
    [ts.SyntaxKind.ClassDeclaration]: true,
    [ts.SyntaxKind.FunctionDeclaration]: true,
    [ts.SyntaxKind.InterfaceDeclaration]: true,
    [ts.SyntaxKind.MethodDeclaration]: true,
    [ts.SyntaxKind.PropertyDeclaration]: true,
    [ts.SyntaxKind.PropertyDeclaration]: true,
    [ts.SyntaxKind.VariableDeclaration]: true,
  };

  isInsideConstExpr(node: ts.Node): boolean {
    while (node.parent) {
      if (node.parent.kind === ts.SyntaxKind.Parameter &&
          (node.parent as ts.ParameterDeclaration).initializer === node) {
        // initializers of parameters must be const in Dart.
        return true;
      }
      if (this.isConstExpr(node)) return true;
      node = node.parent;
      if (FacadeConverter.DECLARATIONS[node.kind]) {
        // Stop walking upwards when hitting a declaration - @ts2dart_const should only propagate
        // to the immediate declaration it applies to (but should be transitive in expressions).
        return false;
      }
    }
    return false;
  }

  isConstClass(decl: base.ClassLike) {
    return this.hasConstComment(decl) || this.hasAnnotation(decl.decorators, 'CONST') ||
        (<ts.NodeArray<ts.Declaration>>decl.members).some((m) => {
          if (m.kind !== ts.SyntaxKind.Constructor) return false;
          return this.hasAnnotation(m.decorators, 'CONST');
        });
  }

  /**
   * isConstExpr returns true if the passed in expression itself is a const expression. const
   * expressions are marked by the special comment @ts2dart_const (expr), or by the special
   * function call CONST_EXPR.
   */
  isConstExpr(node: ts.Node): boolean {
    if (!node) return false;

    if (this.hasConstComment(node)) {
      return true;
    }

    return node.kind === ts.SyntaxKind.CallExpression &&
        base.ident((<ts.CallExpression>node).expression) === 'CONST_EXPR';
  }

  hasConstComment(node: ts.Node): boolean { return this.hasMarkerComment(node, '@ts2dart_const'); }

  private hasMarkerComment(node: ts.Node, markerText: string): boolean {
    let text = node.getFullText();
    let comments = ts.getLeadingCommentRanges(text, 0);
    if (!comments) return false;
    for (let c of comments) {
      let commentText = text.substring(c.pos, c.end);
      if (commentText.indexOf(markerText) !== -1) {
        return true;
      }
    }
    return false;
  }

  private emitMethodCall(name: string, args?: ts.Expression[]) {
    this.emit('.');
    this.emitCall(name, args);
  }

  private emitCall(name: string, args?: ts.Expression[]) {
    this.emit(name);
    this.emit('(');
    if (args) this.visitList(args);
    this.emit(')');
  }

  private stdlibTypeReplacements: ts.Map<string> = {
    'Date': 'DateTime',
    'Array': 'List',
    'XMLHttpRequest': 'HttpRequest',
    'Uint8Array': 'Uint8List',
    'ArrayBuffer': 'ByteBuffer',
    'Promise': 'Future',

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

  private tsToDartTypeNames: ts.Map<ts.Map<string>> = {
    [DEFAULT_LIB_MARKER]: this.stdlibTypeReplacements,
    'angular2/src/facade/lang': {'Date': 'DateTime'},

    'rxjs/Observable': {'Observable': 'Stream'},
    'es6-promise/es6-promise': {'Promise': 'Future'},
    'es6-shim/es6-shim': {'Promise': 'Future'},
  };

  private es6Promises: ts.Map<CallHandler> = {
    'Promise.catch': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      this.emit('.catchError(');
      this.visitList(c.arguments);
      this.emit(')');
    },
    'Promise.then': (c: ts.CallExpression, context: ts.Expression) => {
      // then() in Dart doesn't support 2 arguments.
      this.visit(context);
      this.emit('.then(');
      this.visit(c.arguments[0]);
      this.emit(')');
      if (c.arguments.length > 1) {
        this.emit('.catchError(');
        this.visit(c.arguments[1]);
        this.emit(')');
      }
    },
    'Promise': (c: ts.CallExpression, context: ts.Expression) => {
      if (c.kind !== ts.SyntaxKind.NewExpression) return true;
      this.assert(c, c.arguments.length === 1, 'Promise construction must take 2 arguments.');
      this.assert(
          c, c.arguments[0].kind === ts.SyntaxKind.ArrowFunction ||
              c.arguments[0].kind === ts.SyntaxKind.FunctionExpression,
          'Promise argument must be a function expression (or arrow function).');
      let callback: ts.FunctionLikeDeclaration;
      if (c.arguments[0].kind === ts.SyntaxKind.ArrowFunction) {
        callback = <ts.FunctionLikeDeclaration>(<ts.ArrowFunction>c.arguments[0]);
      } else if (c.arguments[0].kind === ts.SyntaxKind.FunctionExpression) {
        callback = <ts.FunctionLikeDeclaration>(<ts.FunctionExpression>c.arguments[0]);
      }
      this.assert(
          c, callback.parameters.length > 0 && callback.parameters.length < 3,
          'Promise executor must take 1 or 2 arguments (resolve and reject).');

      const completerVarName = this.uniqueId('completer');
      this.assert(
          c, callback.parameters[0].name.kind === ts.SyntaxKind.Identifier,
          'First argument of the Promise executor is not a straight parameter.');
      let resolveParameterIdent = <ts.Identifier>(callback.parameters[0].name);

      this.emit('(() {');  // Create a new scope.
      this.emit(`Completer ${completerVarName} = new Completer();`);
      this.emit('var');
      this.emit(resolveParameterIdent.text);
      this.emit(`= ${completerVarName}.complete;`);

      if (callback.parameters.length === 2) {
        this.assert(
            c, callback.parameters[1].name.kind === ts.SyntaxKind.Identifier,
            'First argument of the Promise executor is not a straight parameter.');
        let rejectParameterIdent = <ts.Identifier>(callback.parameters[1].name);
        this.emit('var');
        this.emit(rejectParameterIdent.text);
        this.emit(`= ${completerVarName}.completeError;`);
      }
      this.emit('(()');
      this.visit(callback.body);
      this.emit(')();');
      this.emit(`return ${completerVarName}.future;`);
      this.emit('})()');
    },
  };

  private es6Collections: ts.Map<CallHandler> = {
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
      this.emitMethodCall('containsKey', c.arguments);
    },
    'Map.delete': (c: ts.CallExpression, context: ts.Expression) => {
      // JS Map.delete(k) returns whether k was present in the map,
      // convert to:
      // (Map.containsKey(k) && (Map.remove(k) !== null || true))
      // (Map.remove(k) !== null || true) is required to always returns true
      // when Map.containsKey(k)
      this.emit('(');
      this.visit(context);
      this.emitMethodCall('containsKey', c.arguments);
      this.emit('&& (');
      this.visit(context);
      this.emitMethodCall('remove', c.arguments);
      this.emit('!= null || true ) )');
    },
    'Map.forEach': (c: ts.CallExpression, context: ts.Expression) => {
      let cb: any;
      let params: any;

      switch (c.arguments[0].kind) {
        case ts.SyntaxKind.FunctionExpression:
          cb = <ts.FunctionExpression>(c.arguments[0]);
          params = cb.parameters;
          if (params.length !== 2) {
            this.reportError(c, 'Map.forEach callback requires exactly two arguments');
            return;
          }
          this.visit(context);
          this.emit('. forEach ( (');
          this.visit(params[1]);
          this.emit(',');
          this.visit(params[0]);
          this.emit(')');
          this.visit(cb.body);
          this.emit(')');
          break;

        case ts.SyntaxKind.ArrowFunction:
          cb = <ts.ArrowFunction>(c.arguments[0]);
          params = cb.parameters;
          if (params.length !== 2) {
            this.reportError(c, 'Map.forEach callback requires exactly two arguments');
            return;
          }
          this.visit(context);
          this.emit('. forEach ( (');
          this.visit(params[1]);
          this.emit(',');
          this.visit(params[0]);
          this.emit(')');
          if (cb.body.kind !== ts.SyntaxKind.Block) {
            this.emit('=>');
          }
          this.visit(cb.body);
          this.emit(')');
          break;

        default:
          this.visit(context);
          this.emit('. forEach ( ( k , v ) => (');
          this.visit(c.arguments[0]);
          this.emit(') ( v , k ) )');
          break;
      }
    },
    'Array.find': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      this.emit('. firstWhere (');
      this.visit(c.arguments[0]);
      this.emit(', orElse : ( ) => null )');
    },
  };

  private stdlibHandlers: ts.Map<CallHandler> = merge(this.es6Promises, this.es6Collections, {
    'Array.push': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      this.emitMethodCall('add', c.arguments);
    },
    'Array.pop': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      this.emitMethodCall('removeLast');
    },
    'Array.shift': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      this.emit('. removeAt ( 0 )');
    },
    'Array.unshift': (c: ts.CallExpression, context: ts.Expression) => {
      this.emit('(');
      this.visit(context);
      if (c.arguments.length === 1) {
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
      this.emitMethodCall('map', c.arguments);
      this.emitMethodCall('toList');
    },
    'Array.filter': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      this.emitMethodCall('where', c.arguments);
      this.emitMethodCall('toList');
    },
    'Array.some': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      this.emitMethodCall('any', c.arguments);
    },
    'Array.slice': (c: ts.CallExpression, context: ts.Expression) => {
      this.emitCall('ListWrapper.slice', [context, ...c.arguments]);
    },
    'Array.splice': (c: ts.CallExpression, context: ts.Expression) => {
      this.emitCall('ListWrapper.splice', [context, ...c.arguments]);
    },
    'Array.concat': (c: ts.CallExpression, context: ts.Expression) => {
      this.emit('( new List . from (');
      this.visit(context);
      this.emit(')');
      c.arguments.forEach(arg => {
        if (!this.isNamedDefaultLibType(arg, 'Array')) {
          this.reportError(arg, 'Array.concat only takes Array arguments');
        }
        this.emit('.. addAll (');
        this.visit(arg);
        this.emit(')');
      });
      this.emit(')');
    },
    'Array.join': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      if (c.arguments.length) {
        this.emitMethodCall('join', c.arguments);
      } else {
        this.emit('. join ( "," )');
      }
    },
    'Array.reduce': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);

      if (c.arguments.length >= 2) {
        this.emitMethodCall('fold', [c.arguments[1], c.arguments[0]]);
      } else {
        this.emit('. fold ( null ,');
        this.visit(c.arguments[0]);
        this.emit(')');
      }
    },
    'ArrayConstructor.isArray': (c: ts.CallExpression, context: ts.Expression) => {
      this.emit('( (');
      this.visitList(c.arguments);  // Should only be 1.
      this.emit(')');
      this.emit('is List');
      this.emit(')');
    },
    'Console.log': (c: ts.CallExpression, context: ts.Expression) => {
      this.emit('print(');
      if (c.arguments.length === 1) {
        this.visit(c.arguments[0]);
      } else {
        this.emit('[');
        this.visitList(c.arguments);
        this.emit('].join(" ")');
      }
      this.emit(')');
    },
    'RegExp.exec': (c: ts.CallExpression, context: ts.Expression) => {
      if (context.kind !== ts.SyntaxKind.RegularExpressionLiteral) {
        // Fail if the exec call isn't made directly on a regexp literal.
        // Multiple exec calls on the same global regexp have side effects
        // (each return the next match), which we can't reproduce with a simple
        // Dart RegExp (users should switch to some facade / wrapper instead).
        this.reportError(
            c, 'exec is only supported on regexp literals, ' +
                'to avoid side-effect of multiple calls on global regexps.');
      }
      if (c.parent.kind === ts.SyntaxKind.ElementAccessExpression) {
        // The result of the exec call is used for immediate indexed access:
        // this use-case can be accommodated by RegExp.firstMatch, which returns
        // a Match instance with operator[] which returns groups (special index
        // 0 returns the full text of the match).
        this.visit(context);
        this.emitMethodCall('firstMatch', c.arguments);
      } else {
        // In the general case, we want to return a List. To transform a Match
        // into a List of its groups, we alias it in a local closure that we
        // call with the Match value. We are then able to use the group method
        // to generate a List large enough to hold groupCount groups + the
        // full text of the match at special group index 0.
        this.emit('((match) => new List.generate(1 + match.groupCount, match.group))(');
        this.visit(context);
        this.emitMethodCall('firstMatch', c.arguments);
        this.emit(')');
      }
    },
    'RegExp.test': (c: ts.CallExpression, context: ts.Expression) => {
      this.visit(context);
      this.emitMethodCall('hasMatch', c.arguments);
    },
    'String.substr': (c: ts.CallExpression, context: ts.Expression) => {
      this.reportError(
          c, 'substr is unsupported, use substring (but beware of the different semantics!)');
      this.visit(context);
      this.emitMethodCall('substr', c.arguments);
    },
  });

  private callHandlerReplaceNew: ts.Map<ts.Map<boolean>> = {
    [DEFAULT_LIB_MARKER]: {'Promise': true},
  };

  private callHandlers: ts.Map<ts.Map<CallHandler>> = {
    [DEFAULT_LIB_MARKER]: this.stdlibHandlers,
    'angular2/manual_typings/globals': this.es6Collections,
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
    'angular2/src/core/di/forward_ref': {
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
      'normalizeBlank': (c: ts.CallExpression, context: ts.Expression) => {
        // normalizeBlank is a noop in Dart, so erase it.
        this.visitList(c.arguments);
      },
    },
  };

  private es6CollectionsProp: ts.Map<PropertyHandler> = {
    'Map.size': (p: ts.PropertyAccessExpression) => {
      this.visit(p.expression);
      this.emit('.');
      this.emit('length');
    },
  };
  private es6PromisesProp: ts.Map<PropertyHandler> = {
    'PromiseConstructor.resolve': (p: ts.PropertyAccessExpression) => {
      this.emit('new ');
      this.visit(p.expression);
      this.emit('.value');
    },
    'PromiseConstructor.reject': (p: ts.PropertyAccessExpression) => {
      this.emit('new ');
      this.visit(p.expression);
      this.emit('.error');
    },
  };

  private propertyHandlers: ts.Map<ts.Map<PropertyHandler>> = {
    [DEFAULT_LIB_MARKER]: merge(this.es6CollectionsProp, this.es6PromisesProp),
  };
}
