/// <reference path='../node_modules/typescript/bin/typescript.d.ts' />
import ts = require('typescript');
import base = require('./base');
import ts2dart = require('./main');

type ClassLike = ts.ClassDeclaration | ts.InterfaceDeclaration;

class DeclarationTranspiler extends base.TranspilerStep {
  constructor(tr: ts2dart.Transpiler) { super(tr); }

  visitNode(node: ts.Node): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.VariableDeclarationList:
        // Note: VariableDeclarationList can only occur as part of a for loop.
        var varDeclList = <ts.VariableDeclarationList>node;
        this.visitList(varDeclList.declarations);
        break;
      case ts.SyntaxKind.VariableDeclaration:
        var varDecl = <ts.VariableDeclaration>node;
        this.visitVariableDeclarationType(varDecl);
        this.visit(varDecl.name);
        if (varDecl.initializer) {
          this.emit('=');
          this.visit(varDecl.initializer);
        }
        break;

      case ts.SyntaxKind.ClassDeclaration:
        var classDecl = <ts.ClassDeclaration>node;
        this.visitClassLike('class', classDecl);
        break;
      case ts.SyntaxKind.InterfaceDeclaration:
        var ifDecl = <ts.InterfaceDeclaration>node;
        this.visitClassLike('abstract class', ifDecl);
        break;
      case ts.SyntaxKind.HeritageClause:
        var heritageClause = <ts.HeritageClause>node;
        if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
          this.emit('extends');
        } else {
          this.emit('implements');
        }
        // Can only have one member for extends clauses.
        this.visitList(heritageClause.types);
        break;
      case ts.SyntaxKind.EnumDeclaration:
        var decl = <ts.EnumDeclaration>node;
        // The only legal modifier for an enum decl is const.
        var isConst = decl.modifiers && (decl.modifiers.flags & ts.NodeFlags.Const);
        if (isConst) {
          this.reportError(node, 'const enums are not supported');
        }
        this.emit('enum');
        this.visit(decl.name);
        this.emit('{');
        // Enums can be empty in TS ...
        if (decl.members.length === 0) {
          // ... but not in Dart.
          this.reportError(node, 'empty enums are not supported');
        }
        this.visitList(decl.members);
        this.emit('}');
        break;
      case ts.SyntaxKind.EnumMember:
        var member = <ts.EnumMember>node;
        this.visit(member.name);
        if (member.initializer) {
          this.reportError(node, 'enum initializers are not supported');
        }
        break;
      case ts.SyntaxKind.Constructor:
        var ctorDecl = <ts.ConstructorDeclaration>node;
        // Find containing class name.
        var className;
        for (var parent = ctorDecl.parent; parent; parent = parent.parent) {
          if (parent.kind == ts.SyntaxKind.ClassDeclaration) {
            className = (<ts.ClassDeclaration>parent).name;
            break;
          }
        }
        if (!className) this.reportError(ctorDecl, 'cannot find outer class node');
        this.visitDeclarationMetadata(ctorDecl);
        this.visit(className);
        this.visitParameters(ctorDecl);
        this.visit(ctorDecl.body);
        break;
      case ts.SyntaxKind.PropertyDeclaration:
        var propertyDecl = <ts.PropertyDeclaration>node;
        this.visitDeclarationMetadata(propertyDecl);
        var hasConstCtor = this.hasConstCtor(<ClassLike>propertyDecl.parent);
        if (hasConstCtor) {
          this.emit('final');
        }
        if (propertyDecl.type) {
          this.visit(propertyDecl.type);
        } else if (!hasConstCtor) {
          this.emit('var');
        }
        this.visit(propertyDecl.name);
        if (propertyDecl.initializer) {
          this.emit('=');
          this.visit(propertyDecl.initializer);
        }
        this.emit(';');
        break;
      case ts.SyntaxKind.MethodDeclaration:
        this.visitDeclarationMetadata(<ts.MethodDeclaration>node);
        this.visitFunctionLike(<ts.MethodDeclaration>node);
        break;
      case ts.SyntaxKind.GetAccessor:
        this.visitDeclarationMetadata(<ts.MethodDeclaration>node);
        this.visitFunctionLike(<ts.AccessorDeclaration>node, 'get');
        break;
      case ts.SyntaxKind.SetAccessor:
        this.visitDeclarationMetadata(<ts.MethodDeclaration>node);
        this.visitFunctionLike(<ts.AccessorDeclaration>node, 'set');
        break;
      case ts.SyntaxKind.FunctionDeclaration:
        var funcDecl = <ts.FunctionDeclaration>node;
        this.visitDecorators(funcDecl.decorators);
        if (funcDecl.typeParameters) this.reportError(node, 'generic functions are unsupported');
        this.visitFunctionLike(funcDecl);
        break;
      case ts.SyntaxKind.ArrowFunction:
        var arrowFunc = <ts.FunctionExpression>node;
        // Dart only allows expressions following the fat arrow operator.
        // If the body is a block, we have to drop the fat arrow and emit an
        // anonymous function instead.
        if (arrowFunc.body.kind == ts.SyntaxKind.Block) {
          this.visitFunctionLike(arrowFunc);
        } else {
          this.visitParameters(arrowFunc);
          this.emit('=>');
          this.visit(arrowFunc.body);
        }
        break;
      case ts.SyntaxKind.FunctionExpression:
        var funcExpr = <ts.FunctionExpression>node;
        this.visitFunctionLike(funcExpr);
        break;
      case ts.SyntaxKind.MethodSignature:
        var methodSignatureDecl = <ts.FunctionLikeDeclaration>node;
        this.emit('abstract');
        this.visitEachIfPresent(methodSignatureDecl.modifiers);
        this.visitFunctionLike(methodSignatureDecl);
        break;
      case ts.SyntaxKind.Parameter:
        var paramDecl = <ts.ParameterDeclaration>node;
        if (paramDecl.dotDotDotToken) this.reportError(node, 'rest parameters are unsupported');
        if (paramDecl.name.kind === ts.SyntaxKind.ObjectBindingPattern) {
          this.visitNamedParameter(paramDecl);
          break;
        }
        this.visitDecorators(paramDecl.decorators);
        if (paramDecl.type) this.visit(paramDecl.type);
        this.visit(paramDecl.name);
        if (paramDecl.initializer) {
          this.emit('=');
          this.visit(paramDecl.initializer);
        }
        break;
      case ts.SyntaxKind.ObjectBindingPattern:
        var bindingPattern = <ts.BindingPattern>node;
        this.emit('{');
        this.visitList(bindingPattern.elements);
        this.emit('}');
        break;
      case ts.SyntaxKind.BindingElement:
        var bindingElement = <ts.BindingElement>node;
        this.visit(bindingElement.name);
        if (bindingElement.initializer) {
          this.emit(':');
          this.visit(bindingElement.initializer);
        }
        break;

      case ts.SyntaxKind.StaticKeyword:
        this.emit('static');
        break;
      case ts.SyntaxKind.PrivateKeyword:
        // no-op, handled through '_' naming convention in Dart.
        break;
      case ts.SyntaxKind.ProtectedKeyword:
        // Handled in `visitDeclarationMetadata` below.
        break;

      default:
        return false;
    }
    return true;
  }

  private visitVariableDeclarationType(varDecl: ts.VariableDeclaration) {
    /* Note: VariableDeclarationList can only occur as part of a for loop. This helper method
     * is meant for processing for-loop variable declaration types only.
     *
     * In Dart, all variables in a variable declaration list must have the same type. Since
     * we are doing syntax directed translation, we cannot reliably determine if distinct
     * variables are declared with the same type or not. Hence we support the following cases:
     *
     * - A variable declaration list with a single variable can be explicitly typed.
     * - When more than one variable is in the list, all must be implicitly typed.
     */
    var firstDecl = varDecl.parent.declarations[0];
    var msg = 'Variables in a declaration list of more than one variable cannot by typed';
    var isConst = this.hasFlag(varDecl.parent, ts.NodeFlags.Const);
    if (firstDecl === varDecl) {
      if (isConst) this.emit('const');
      if (!varDecl.type) {
        if (!isConst) this.emit('var');
      } else if (varDecl.parent.declarations.length > 1) {
        this.reportError(varDecl, msg);
      } else {
        this.visit(varDecl.type);
      }
    } else if (varDecl.type) {
      this.reportError(varDecl, msg);
    }
  }

  private visitFunctionLike(fn: ts.FunctionLikeDeclaration, accessor?: string) {
    if (fn.type) this.visit(fn.type);
    if (accessor) this.emit(accessor);
    if (fn.name) this.visit(fn.name);
    // Dart does not even allow the parens of an empty param list on getter
    if (accessor !== 'get') {
      this.visitParameters(fn);
    } else {
      if (fn.parameters && fn.parameters.length > 0) {
        this.reportError(fn, 'getter should not accept parameters');
      }
    }
    if (fn.body) {
      this.visit(fn.body);
    } else {
      this.emit(';');
    }
  }

  private visitParameters(fn: ts.FunctionLikeDeclaration) {
    this.emit('(');
    let firstInitParamIdx;
    for (firstInitParamIdx = 0; firstInitParamIdx < fn.parameters.length; firstInitParamIdx++) {
      // ObjectBindingPatterns are handled within the parameter visit.
      if (fn.parameters[firstInitParamIdx].initializer &&
          fn.parameters[firstInitParamIdx].name.kind !== ts.SyntaxKind.ObjectBindingPattern) {
        break;
      }
    }

    if (firstInitParamIdx !== 0) {
      var requiredParams = fn.parameters.slice(0, firstInitParamIdx);
      this.visitList(requiredParams);
    }

    if (firstInitParamIdx !== fn.parameters.length) {
      if (firstInitParamIdx !== 0) this.emit(',');
      var positionalOptional = fn.parameters.slice(firstInitParamIdx, fn.parameters.length);
      this.emit('[');
      this.visitList(positionalOptional);
      this.emit(']');
    }

    this.emit(')');
  }

  private visitClassLike(keyword: string, decl: ClassLike) {
    this.visitDecorators(decl.decorators);
    this.emit(keyword);
    this.visit(decl.name);
    if (decl.typeParameters) {
      this.emit('<');
      this.visitList(decl.typeParameters);
      this.emit('>');
    }
    this.visitEachIfPresent(decl.heritageClauses);
    // Check for @IMPLEMENTS interfaces to add.
    // TODO(martinprobst): Drop all special cases for @SOMETHING after migration to TypeScript.
    var implIfs = this.getImplementsDecorators(decl.decorators);
    if (implIfs.length > 0) {
      // Check if we have to emit an 'implements ' or a ', '
      if (decl.heritageClauses && decl.heritageClauses.length > 0 &&
          decl.heritageClauses.some((hc) => hc.token === ts.SyntaxKind.ImplementsKeyword)) {
        // There was some implements clause.
        this.emit(',');
      } else {
        this.emit('implements');
      }
      this.emit(implIfs.join(' , '));
    }
    this.emit('{');
    this.visitEachIfPresent(decl.members);
    this.emit('}');
  }

  /** Returns the parameters passed to @IMPLEMENTS as the identifier's string values. */
  private getImplementsDecorators(decorators: ts.NodeArray<ts.Decorator>): string[] {
    var interfaces = [];
    if (!decorators) return interfaces;
    decorators.forEach((d) => {
      if (d.expression.kind !== ts.SyntaxKind.CallExpression) return;
      var funcExpr = <ts.CallExpression>d.expression;
      if (base.ident(funcExpr.expression) !== 'IMPLEMENTS') return;
      funcExpr.arguments.forEach((a) => {
        var interf = base.ident(a);
        if (!interf) this.reportError(a, '@IMPLEMENTS only supports literal identifiers');
        interfaces.push(interf);
      });
    });
    return interfaces;
  }

  private visitDecorators(decorators: ts.NodeArray<ts.Decorator>) {
    if (!decorators) return;

    var isAbstract = false, isConst = false;
    decorators.forEach((d) => {
      // Special case @CONST & @ABSTRACT
      // TODO(martinprobst): remove once the code base is migrated to TypeScript.
      var name = base.ident(d.expression);
      if (!name && d.expression.kind === ts.SyntaxKind.CallExpression) {
        // Unwrap @CONST()
        var callExpr = (<ts.CallExpression>d.expression);
        name = base.ident(callExpr.expression);
      }
      // Make sure these match IGNORED_ANNOTATIONS below.
      // TODO(martinprobst): Re-enable the early exits below once moved to TypeScript.
      if (name === 'ABSTRACT') {
        isAbstract = true;
        // this.emit('abstract');
        // return;
      }
      if (name === 'CONST') {
        isConst = true;
        // this.emit('const');
        // return;
      }
      if (name === 'IMPLEMENTS') {
        // Ignore @IMPLEMENTS - it's handled above in visitClassLike.
        // return;
      }
      this.emit('@');
      this.visit(d.expression);
    });
    if (isAbstract) this.emit('abstract');
    if (isConst) this.emit('const');
  }

  private visitDeclarationMetadata(decl: ts.Declaration) {
    this.visitDecorators(decl.decorators);
    this.visitEachIfPresent(decl.modifiers);

    // Temporarily deactivated to make migration of Angular code base easier.
    return;

    if (this.hasFlag(decl.modifiers, ts.NodeFlags.Protected)) {
      this.reportError(decl, 'protected declarations are unsupported');
      return;
    }
    var name = base.ident(decl.name);
    if (!name) return;
    var isPrivate = this.hasFlag(decl.modifiers, ts.NodeFlags.Private);
    var matchesPrivate = !!name.match(/^_/);
    if (isPrivate && !matchesPrivate) {
      this.reportError(decl, 'private members must be prefixed with "_"');
    }
    if (!isPrivate && matchesPrivate) {
      this.reportError(decl, 'public members must not be prefixed with "_"');
    }
  }

  private hasConstCtor(decl: ClassLike) {
    return decl.members.some((m) => {
      if (m.kind !== ts.SyntaxKind.Constructor) return false;
      return this.hasAnnotation(m.decorators, 'CONST');
    });
  }

  private visitNamedParameter(paramDecl: ts.ParameterDeclaration) {
    this.visitDecorators(paramDecl.decorators);
    if (paramDecl.type) {
      // TODO(martinprobst): These are currently silently ignored.
      // this.reportError(paramDecl.type, 'types on named parameters are unsupported');
    }
    this.visit(paramDecl.name);
    if (paramDecl.initializer) {
      if (paramDecl.initializer.kind !== ts.SyntaxKind.ObjectLiteralExpression ||
          (<ts.ObjectLiteralExpression>paramDecl.initializer).properties.length > 0) {
        this.reportError(paramDecl,
                         'initializers for named parameters must be empty object literals');
      }
    }
  }
}

export = DeclarationTranspiler;
