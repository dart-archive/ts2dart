import * as ts from 'typescript';
import * as base from './base';
import {Transpiler} from './main';
import {FacadeConverter} from './facade_converter';

export default class DeclarationTranspiler extends base.TranspilerBase {
  constructor(
      tr: Transpiler, private fc: FacadeConverter, private enforceUnderscoreConventions: boolean) {
    super(tr);
  }

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
        if (classDecl.modifiers && (classDecl.modifiers.flags & ts.NodeFlags.Abstract)) {
          this.visitClassLike('abstract class', classDecl);
        } else {
          this.visitClassLike('class', classDecl);
        }
        break;
      case ts.SyntaxKind.InterfaceDeclaration:
        var ifDecl = <ts.InterfaceDeclaration>node;
        // Function type interface in an interface with a single declaration
        // of a call signature (http://goo.gl/ROC5jN).
        if (ifDecl.members.length === 1 && ifDecl.members[0].kind === ts.SyntaxKind.CallSignature) {
          let member = <ts.CallSignatureDeclaration>ifDecl.members[0];
          this.visitFunctionTypedefInterface(ifDecl.name.text, member, ifDecl.typeParameters);
        } else {
          this.visitClassLike('abstract class', ifDecl);
        }
        break;
      case ts.SyntaxKind.HeritageClause:
        var heritageClause = <ts.HeritageClause>node;
        if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword &&
            heritageClause.parent.kind != ts.SyntaxKind.InterfaceDeclaration) {
          this.emit('extends');
        } else {
          this.emit('implements');
        }
        // Can only have one member for extends clauses.
        this.visitList(heritageClause.types);
        break;
      case ts.SyntaxKind.ExpressionWithTypeArguments:
        var exprWithTypeArgs = <ts.ExpressionWithTypeArguments>node;
        this.visit(exprWithTypeArgs.expression);
        this.maybeVisitTypeArguments(exprWithTypeArgs);
        break;
      case ts.SyntaxKind.EnumDeclaration:
        var decl = <ts.EnumDeclaration>node;
        // The only legal modifier for an enum decl is const.
        var isConst = decl.modifiers && (decl.modifiers.flags & ts.NodeFlags.Const);
        if (isConst) {
          this.reportError(node, 'const enums are not supported');
        }
        this.emit('enum');
        this.fc.visitTypeName(decl.name);
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
        var className: ts.Identifier;
        for (var parent = ctorDecl.parent; parent; parent = parent.parent) {
          if (parent.kind == ts.SyntaxKind.ClassDeclaration) {
            className = (<ts.ClassDeclaration>parent).name;
            break;
          }
        }
        if (!className) this.reportError(ctorDecl, 'cannot find outer class node');
        this.visitDeclarationMetadata(ctorDecl);
        if (this.isConst(<base.ClassLike>ctorDecl.parent)) {
          this.emit('const');
        }
        this.visit(className);
        this.visitParameters(ctorDecl.parameters);
        this.visit(ctorDecl.body);
        break;
      case ts.SyntaxKind.PropertyDeclaration:
        this.visitProperty(<ts.PropertyDeclaration>node);
        break;
      case ts.SyntaxKind.SemicolonClassElement:
        // No-op, don't emit useless declarations.
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
          this.visitParameters(arrowFunc.parameters);
          this.emit('=>');
          this.visit(arrowFunc.body);
        }
        break;
      case ts.SyntaxKind.FunctionExpression:
        var funcExpr = <ts.FunctionExpression>node;
        this.visitFunctionLike(funcExpr);
        break;
      case ts.SyntaxKind.PropertySignature:
        var propSig = <ts.PropertyDeclaration>node;
        this.visitProperty(propSig);
        break;
      case ts.SyntaxKind.MethodSignature:
        var methodSignatureDecl = <ts.FunctionLikeDeclaration>node;
        this.visitEachIfPresent(methodSignatureDecl.modifiers);
        this.visitFunctionLike(methodSignatureDecl);
        break;
      case ts.SyntaxKind.Parameter:
        var paramDecl = <ts.ParameterDeclaration>node;
        // Property parameters will have an explicit property declaration, so we just
        // need the dart assignment shorthand to reference the property.
        if (this.hasFlag(paramDecl.modifiers, ts.NodeFlags.Public) ||
            this.hasFlag(paramDecl.modifiers, ts.NodeFlags.Private) ||
            this.hasFlag(paramDecl.modifiers, ts.NodeFlags.Protected)) {
          this.visitDeclarationMetadata(paramDecl);
          this.emit('this .');
          this.visit(paramDecl.name);
          if (paramDecl.initializer) {
            this.emit('=');
            this.visit(paramDecl.initializer);
          }
          break;
        }
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

      case ts.SyntaxKind.StaticKeyword:
        this.emit('static');
        break;
      case ts.SyntaxKind.AbstractKeyword:
        // Abstract methods in Dart simply lack implementation,
        // and don't use the 'abstract' modifier
        // Abstract classes are handled in `case ts.SyntaxKind.ClassDeclaration` above.
        break;
      case ts.SyntaxKind.PrivateKeyword:
        // no-op, handled through '_' naming convention in Dart.
        break;
      case ts.SyntaxKind.PublicKeyword:
        // Handled in `visitDeclarationMetadata` below.
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
    this.fc.pushTypeParameterNames(fn);
    try {
      if (fn.type) {
        if (fn.kind === ts.SyntaxKind.ArrowFunction) {
          // Type is silently dropped for arrow functions, not supported in Dart.
          this.emit('/*');
          this.visit(fn.type);
          this.emit('*/');
        } else {
          this.visit(fn.type);
        }
      }
      if (accessor) this.emit(accessor);
      if (fn.name) this.visit(fn.name);
      if (fn.typeParameters) {
        this.emit('/*<');
        // Emit the names literally instead of visiting, otherwise they will be replaced with the
        // comment hack themselves.
        this.emit(fn.typeParameters.map(p => base.ident(p.name)).join(', '));
        this.emit('>*/');
      }
      // Dart does not even allow the parens of an empty param list on getter
      if (accessor !== 'get') {
        this.visitParameters(fn.parameters);
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
    } finally {
      this.fc.popTypeParameterNames(fn);
    }
  }

  private visitParameters(parameters: ts.ParameterDeclaration[]) {
    this.emit('(');
    let firstInitParamIdx = 0;
    for (; firstInitParamIdx < parameters.length; firstInitParamIdx++) {
      // ObjectBindingPatterns are handled within the parameter visit.
      let isOpt =
          parameters[firstInitParamIdx].initializer || parameters[firstInitParamIdx].questionToken;
      if (isOpt && parameters[firstInitParamIdx].name.kind !== ts.SyntaxKind.ObjectBindingPattern) {
        break;
      }
    }

    if (firstInitParamIdx !== 0) {
      var requiredParams = parameters.slice(0, firstInitParamIdx);
      this.visitList(requiredParams);
    }

    if (firstInitParamIdx !== parameters.length) {
      if (firstInitParamIdx !== 0) this.emit(',');
      var positionalOptional = parameters.slice(firstInitParamIdx, parameters.length);
      this.emit('[');
      this.visitList(positionalOptional);
      this.emit(']');
    }

    this.emit(')');
  }

  /**
   * Visit a property declaration.
   * In the special case of property parameters in a constructor, we also allow a parameter to be
   * emitted as a property.
   */
  private visitProperty(
      decl: ts.PropertyDeclaration | ts.ParameterDeclaration, isParameter: boolean = false) {
    if (!isParameter) this.visitDeclarationMetadata(decl);
    var containingClass = <base.ClassLike>(isParameter ? decl.parent.parent : decl.parent);
    var isConstField = this.hasAnnotation(decl.decorators, 'CONST');
    if (isConstField) {
      // const implies final
      this.emit('const');
    } else {
      var hasConstCtor = this.isConst(containingClass);
      if (hasConstCtor) {
        this.emit('final');
      }
    }
    if (decl.type) {
      this.visit(decl.type);
    } else if (!isConstField && !hasConstCtor) {
      this.emit('var');
    }
    this.visit(decl.name);
    if (decl.initializer && !isParameter) {
      this.emit('=');
      this.visit(decl.initializer);
    }
    this.emit(';');
  }

  private visitClassLike(keyword: string, decl: base.ClassLike) {
    this.visitDecorators(decl.decorators);
    this.emit(keyword);
    this.fc.visitTypeName(decl.name);
    if (decl.typeParameters) {
      this.emit('<');
      this.visitList(decl.typeParameters);
      this.emit('>');
    }
    this.visitEachIfPresent(decl.heritageClauses);
    this.emit('{');

    // Synthesize explicit properties for ctor with 'property parameters'
    let synthesizePropertyParam = (param: ts.ParameterDeclaration) => {
      if (this.hasFlag(param.modifiers, ts.NodeFlags.Public) ||
          this.hasFlag(param.modifiers, ts.NodeFlags.Private) ||
          this.hasFlag(param.modifiers, ts.NodeFlags.Protected)) {
        // TODO: we should enforce the underscore prefix on privates
        this.visitProperty(param, true);
      }
    };
    (<ts.NodeArray<ts.Declaration>>decl.members)
        .filter((m) => m.kind == ts.SyntaxKind.Constructor)
        .forEach(
            (ctor) =>
                (<ts.ConstructorDeclaration>ctor).parameters.forEach(synthesizePropertyParam));
    this.visitEachIfPresent(decl.members);

    // Generate a constructor to host the const modifier, if needed
    if (this.isConst(decl) &&
        !(<ts.NodeArray<ts.Declaration>>decl.members)
             .some((m) => m.kind == ts.SyntaxKind.Constructor)) {
      this.emit('const');
      this.fc.visitTypeName(decl.name);
      this.emit('();')
    }
    this.emit('}');
  }

  private visitDecorators(decorators: ts.NodeArray<ts.Decorator>) {
    if (!decorators) return;

    decorators.forEach((d) => {
      // Special case @CONST
      var name = base.ident(d.expression);
      if (!name && d.expression.kind === ts.SyntaxKind.CallExpression) {
        // Unwrap @CONST()
        var callExpr = (<ts.CallExpression>d.expression);
        name = base.ident(callExpr.expression);
      }
      // Make sure these match IGNORED_ANNOTATIONS below.
      if (name === 'CONST') {
        // Ignore @CONST - it is handled above in visitClassLike.
        return;
      }
      this.emit('@');
      this.visit(d.expression);
    });
  }

  private visitDeclarationMetadata(decl: ts.Declaration) {
    this.visitDecorators(decl.decorators);
    this.visitEachIfPresent(decl.modifiers);

    if (this.hasFlag(decl.modifiers, ts.NodeFlags.Protected)) {
      this.reportError(decl, 'protected declarations are unsupported');
      return;
    }
    if (!this.enforceUnderscoreConventions) return;
    // Early return in case this is a decl with no name, such as a constructor
    if (!decl.name) return;
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

  private visitNamedParameter(paramDecl: ts.ParameterDeclaration) {
    this.visitDecorators(paramDecl.decorators);
    let bp = <ts.BindingPattern>paramDecl.name;
    let typeMap: ts.Map<ts.TypeNode> = {};
    if (paramDecl.type && paramDecl.type.kind === ts.SyntaxKind.TypeLiteral) {
      for (let tn of(<ts.TypeLiteralNode>paramDecl.type).members) {
        if (tn.kind !== ts.SyntaxKind.PropertySignature) {
          this.reportError(tn, 'unsupported named parameter kind ' + tn.kind);
          continue;
        }
        let pd = <ts.PropertySignature>tn;
        typeMap[base.ident(pd.name)] = pd.type;
      }
    }
    let initMap: ts.Map<ts.Expression> = {};
    if (paramDecl.initializer) {
      if (paramDecl.initializer.kind !== ts.SyntaxKind.ObjectLiteralExpression) {
        this.reportError(paramDecl, 'initializers for named parameters must be object literals');
        return;
      }
      for (let i of(<ts.ObjectLiteralExpression>paramDecl.initializer).properties) {
        if (i.kind !== ts.SyntaxKind.PropertyAssignment) {
          this.reportError(i, 'named parameter initializers must be properties, got ' + i.kind);
          continue;
        }
        let ole = <ts.PropertyAssignment>i;
        initMap[base.ident(ole.name)] = ole.initializer;
      }
    }
    this.emit('{');
    for (let i = 0; i < bp.elements.length; i++) {
      let elem = bp.elements[i];
      let type = typeMap[base.ident(elem.name)];
      if (type) this.visit(type);
      this.visit(elem.name);
      if (elem.initializer && initMap[base.ident(elem.name)]) {
        this.reportError(elem, 'cannot have both an inner and outer initializer');
      }
      let init = elem.initializer || initMap[base.ident(elem.name)];
      if (init) {
        this.emit(':');
        this.visit(init);
      }
      if (i + 1 < bp.elements.length) this.emit(',');
    }
    this.emit('}');
  }

  /**
   * Handles a function typedef-like interface, i.e. an interface that only declares a single
   * call signature, by translating to a Dart `typedef`.
   */
  private visitFunctionTypedefInterface(
      name: string, signature: ts.CallSignatureDeclaration,
      typeParameters: ts.NodeArray<ts.TypeParameterDeclaration>) {
    this.emit('typedef');
    if (signature.type) {
      this.visit(signature.type);
    }
    this.emit(name);
    if (typeParameters) {
      this.emit('<');
      this.visitList(typeParameters);
      this.emit('>');
    }
    this.visitParameters(signature.parameters);
    this.emit(';');
  }
}
