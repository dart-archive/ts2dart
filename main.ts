/// <reference path="typings/node/node.d.ts" />
// Use HEAD version of typescript, installed by npm
/// <reference path="node_modules/typescript/bin/typescript.d.ts" />
require('source-map-support').install();
import ts = require("typescript");

type ClassLike = ts.ClassDeclaration | ts.InterfaceDeclaration;

class Translator {
  result: string = '';
  // Comments attach to all following AST nodes before the next 'physical' token. Track the earliest
  // offset to avoid printing comments multiple times.
  lastCommentIdx: number = -1;
  currentFile: ts.SourceFile;
  errors: string[] = [];
  failFast: boolean;  // For tests, fail on the first problem.

  constructor(failFast: boolean = false) {
    this.failFast = failFast;
  }

  translate(sourceFile: ts.SourceFile) {
    this.currentFile = sourceFile.getSourceFile();
    this.visit(sourceFile);
    if (this.errors.length) {
      var e = new Error(this.errors.join('\n'));
      e.name = 'TS2DartError';
      throw e;
    }
    return this.result;
  }

  emit(str: string) {
    this.result += ' ';
    this.result += str;
  }

  visitEach(nodes: ts.Node[]) { nodes.forEach((n) => this.visit(n)); }

  visitEachIfPresent(nodes ?: ts.Node[]) {
    if (nodes) this.visitEach(nodes);
  }

  visitList(nodes: ts.Node[], separator: string = ',') {
    for (var i = 0; i < nodes.length; i++) {
      this.visit(nodes[i]);
      if (i < nodes.length - 1) this.emit(separator);
    }
  }

  visitParameters(fn: ts.FunctionLikeDeclaration) {
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

  visitFunctionLike(fn: ts.FunctionLikeDeclaration, accessor ?: string) {
    if (fn.type) this.visit(fn.type);
    if (accessor) this.emit(accessor);
    if (fn.name) this.visit(fn.name);
    // Dart does not even allow the parens of an empty param list on getter
    if (accessor !== 'get') {
      this.visitParameters(fn);
    } else {
      if (fn.parameters && fn.parameters.length > 0) {
        this.reportError(fn, "getter should not accept parameters");
      }
    }
    if (fn.body) {
      this.visit(fn.body);
    } else {
      this.emit(';');
    }
  }

  visitClassLike(keyword: string, decl: ClassLike) {
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
  getImplementsDecorators(decorators: ts.NodeArray<ts.Decorator>): string[] {
    var interfaces = [];
    if (!decorators) return interfaces;
    decorators.forEach((d) => {
      if (d.expression.kind !== ts.SyntaxKind.CallExpression) return;
      var funcExpr = <ts.CallExpression>d.expression;
      if (this.ident(funcExpr.expression) !== 'IMPLEMENTS') return;
      funcExpr.arguments.forEach((a) => {
        var interf = this.ident(a);
        if (!interf) this.reportError(a, '@IMPLEMENTS only supports literal identifiers');
        interfaces.push(interf);
      });
    });
    return interfaces;
  }

  visitCall(c: ts.CallExpression) {
    this.visit(c.expression);
    this.emit('(');
    if (!this.handleNamedParamsCall(c)) {
      this.visitList(c.arguments);
    }
    this.emit(')');
  }

  visitDecorators(decorators: ts.NodeArray<ts.Decorator>) {
    if (!decorators) return;

    decorators.forEach((d) => {
      // Special case @CONST & @ABSTRACT
      // TODO(martinprobst): remove once the code base is migrated to TypeScript.
      var name = this.ident(d.expression);
      if (!name && d.expression.kind === ts.SyntaxKind.CallExpression) {
        // Unwrap @CONST()
        var callExpr = (<ts.CallExpression>d.expression);
        name = this.ident(callExpr.expression);
      }
      if (name === 'ABSTRACT') {
        this.emit('abstract');
        return;
      }
      if (name === 'CONST') {
        this.emit('const');
        return;
      }
      if (name === 'IMPLEMENTS') {
        // Ignore @IMPLEMENTS - it's handled above in visitClassLike.
        return;
      }
      this.emit('@');
      this.visit(d.expression);
    });
  }

  hasAnnotation(decorators: ts.NodeArray<ts.Decorator>, name: string): boolean {
    return decorators && decorators.some((d) => {
      var decName = this.ident(d.expression);
      if (decName === name) return true;
      if (d.expression.kind !== ts.SyntaxKind.CallExpression) return false;
      var callExpr = (<ts.CallExpression>d.expression);
      decName = this.ident(callExpr.expression);
      return decName === name;
    });
  }

  ident(n: ts.Node): string {
    if (n.kind === ts.SyntaxKind.Identifier) return (<ts.Identifier>n).text;
    if (n.kind === ts.SyntaxKind.QualifiedName) {
      var qname = (<ts.QualifiedName>n);
      var leftName = this.ident(qname.left);
      if (leftName) return leftName + '.' + this.ident(qname.right);
    }
    return null;
  }

  handleNamedParamsCall(c: ts.CallExpression): boolean {
    // Preamble: This is all committed in the name of backwards compat with the traceur transpiler.

    // Terrible hack: transform foo(a, b, {c: d}) into foo(a, b, c: d), which is Dart's calling
    // syntax for named/optional parameters. An alternative would be to transform the method
    // declaration to take a plain object literal and destructure in the method, but then client
    // code written against Dart wouldn't get nice named parameters.
    if (c.arguments.length === 0) return false;
    var last = c.arguments[c.arguments.length - 1];
    if (last.kind !== ts.SyntaxKind.ObjectLiteralExpression) return false;
    var objLit = <ts.ObjectLiteralExpression>last;
    if (objLit.properties.length === 0) return false;
    // Even worse: foo(a, b, {'c': d}) is considered to *not* be a named parameters call.
    var hasNonPropAssignments = objLit.properties.some(
        (p) => p.kind != ts.SyntaxKind.PropertyAssignment ||
               (<ts.PropertyAssignment>p).name.kind !== ts.SyntaxKind.Identifier);
    if (hasNonPropAssignments) return false;

    var len = c.arguments.length - 1;
    this.visitList(c.arguments.slice(0, len));
    if (len) this.emit(',');
    var props = objLit.properties;
    for (var i = 0; i < props.length; i++) {
      var prop = <ts.PropertyAssignment>props[i];
      this.emit(this.ident(prop.name));
      this.emit(':');
      this.visit(prop.initializer);
      if (i < objLit.properties.length - 1) this.emit(',');
    }
    return true;
  }

  visitNamedParameter(paramDecl: ts.ParameterDeclaration) {
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

  visitExternalModuleReferenceExpr(expr: ts.Expression) {
    // TODO: what if this isn't a string literal?
    var moduleName = <ts.StringLiteralExpression>expr;
    var text = moduleName.text;
    if (text.match(/^\.\//)) {
      // Strip './' to be more Dart-idiomatic.
      text = text.substring(2);
    } else {
      // Unprefixed imports are package imports.
      text = 'package:' + text;
    }
    moduleName.text = text + '.dart';
    this.visit(expr);
  }

  hasConstCtor(decl: ClassLike) {
    return decl.members.some((m) => {
      if (m.kind !== ts.SyntaxKind.Constructor) return false;
      return this.hasAnnotation(m.decorators, 'CONST');
    });
  }

  /**
   * Handles constructor initializer lists and bodies.
   *
   * <p>Dart's super() ctor calls have to be moved to the constructors initializer list, and `const`
   * constructors must be completely empty, only assigning into fields through the initializer list.
   * The code below finds super() calls and handles const constructors, marked with the special
   * `@CONST` annotation.
   *
   * <p>Not emitting super() calls when traversing the ctor body is handled by maybeHandleSuperCall
   * below.
   */
  visitConstructorBody(ctor: ts.ConstructorDeclaration) {
    var body = ctor.body;
    if (!body) return;

    var errorAssignmentsSuper = 'const constructors can only contain assignments and super calls';
    var errorThisAssignment = 'assignments in const constructors must assign into this.';

    var isConstCtor = this.hasAnnotation(ctor.decorators, 'CONST');
    var superCall;
    var expressions = [];
    // Find super() calls and (if in a const ctor) collect assignment expressions (not statements!)
    body.statements.forEach((stmt) => {
      if (stmt.kind !== ts.SyntaxKind.ExpressionStatement) {
        if (isConstCtor) this.reportError(stmt, errorAssignmentsSuper);
        return;
      }
      var nestedExpr = (<ts.ExpressionStatement>stmt).expression;

      // super() call?
      if (nestedExpr.kind === ts.SyntaxKind.CallExpression) {
        var callExpr = <ts.CallExpression>nestedExpr;
        if (callExpr.expression.kind !== ts.SyntaxKind.SuperKeyword) {
          if (isConstCtor) this.reportError(stmt, errorAssignmentsSuper);
          return;
        }
        superCall = callExpr;
        return;
      }

      // this.x assignment?
      if (isConstCtor) {
        // Check for assignment.
        if (nestedExpr.kind !== ts.SyntaxKind.BinaryExpression) {
          this.reportError(nestedExpr, errorAssignmentsSuper);
          return;
        }
        var binExpr = <ts.BinaryExpression>nestedExpr;
        if (binExpr.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
          this.reportError(binExpr, errorAssignmentsSuper);
          return;
        }
        // Check for 'this.'
        if (binExpr.left.kind !== ts.SyntaxKind.PropertyAccessExpression) {
          this.reportError(binExpr, errorThisAssignment);
          return;
        }
        var lhs = <ts.PropertyAccessExpression>binExpr.left;
        if (lhs.expression.kind !== ts.SyntaxKind.ThisKeyword) {
          this.reportError(binExpr, errorThisAssignment);
          return;
        }
        var ident = lhs.name;
        binExpr.left = ident;
        expressions.push(nestedExpr);
      }
    });

    var hasInitializerExpr = expressions.length > 0;
    if (hasInitializerExpr) {
      // Write out the assignments.
      this.emit(':');
      this.visitList(expressions);
    }
    if (superCall) {
      this.emit(hasInitializerExpr ? ',' : ':');
      this.emit('super (');
      this.visitList(superCall.arguments);
      this.emit(')');
    }
    if (isConstCtor)  {
      // Const ctors don't have bodies.
      this.emit(';');
    } else {
      this.visit(ctor.body);
    }
  }

  /**
   * Checks whether `callExpr` is a super() call that should be ignored because it was already
   * handled by `maybeEmitSuperInitializer` above.
   */
  maybeHandleSuperCall(callExpr: ts.CallExpression): boolean {
    if (callExpr.expression.kind !== ts.SyntaxKind.SuperKeyword) return false;
    // Sanity check that there was indeed a ctor directly above this call.
    var exprStmt = callExpr.parent;
    var ctorBody = exprStmt.parent;
    var ctor = ctorBody.parent;
    if (ctor.kind !== ts.SyntaxKind.Constructor) {
      this.reportError(callExpr, 'super calls must be immediate children of their constructors');
      return false;
    }
    this.emit('/* super call moved to initializer */');
    return true;
  }

  hasFlag(n: {flags: number}, flag: ts.NodeFlags): boolean {
    return n && (n.flags & flag) !== 0 || false;
  }

  visitDeclarationMetadata(decl: ts.Declaration) {
    this.visitDecorators(decl.decorators);
    this.visitEachIfPresent(decl.modifiers);

    // Temporarily deactivated to make migration of Angular code base easier.
    return;

    if (this.hasFlag(decl.modifiers, ts.NodeFlags.Protected)) {
      this.reportError(decl, 'protected declarations are unsupported');
      return;
    }
    var name = this.ident(decl.name);
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

  escapeTextForTemplateString(n: ts.Node): string {
    return (<ts.StringLiteralExpression>n).text.replace(/\\/g, '\\\\').replace(/([$'])/g, '\\$1');
  }

  visitVariableDeclarationType(varDecl: ts.VariableDeclaration) {
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

  reportError(n: ts.Node, message: string) {
    var file = n.getSourceFile() || this.currentFile;
    var start = n.getStart(file);
    var pos = file.getLineAndCharacterOfPosition(start);
    // Line and character are 0-based.
    var fullMessage = `${file.fileName}:${pos.line + 1}:${pos.character + 1}: ${message}`;
    if (this.failFast) throw new Error(fullMessage);
    this.errors.push(fullMessage);
  }

  visit(node: ts.Node) {
    var comments = ts.getLeadingCommentRanges(this.currentFile.text, node.getFullStart());
    if (comments) {
      comments.forEach((c) => {
        if (c.pos <= this.lastCommentIdx) return;
        this.lastCommentIdx = c.pos;
        var text = this.currentFile.text.substring(c.pos, c.end);
        this.emit(text);
        if (c.hasTrailingNewLine) this.result += '\n';
      });
    }

    switch (node.kind) {
      case ts.SyntaxKind.SourceFile:
      case ts.SyntaxKind.EndOfFileToken:
        ts.forEachChild(node, this.visit.bind(this));
        break;

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

      case ts.SyntaxKind.NumberKeyword:
        this.emit('num');
        break;
      case ts.SyntaxKind.StringKeyword:
        this.emit('String');
        break;
      case ts.SyntaxKind.VoidKeyword:
        this.emit('void');
        break;
      case ts.SyntaxKind.SuperKeyword:
        this.emit('super');
        break;
      case ts.SyntaxKind.BooleanKeyword:
        this.emit('bool');
        break;
      case ts.SyntaxKind.AnyKeyword:
        this.emit('dynamic');
        break;

      case ts.SyntaxKind.ParenthesizedExpression:
        var parenExpr = <ts.ParenthesizedExpression>node;
        this.emit('(');
        this.visit(parenExpr.expression);
        this.emit(')');
        break;

      case ts.SyntaxKind.VariableStatement:
        var variableStmt = <ts.VariableStatement>node;
        this.visit(variableStmt.declarationList);
        this.emit(';');
        break;
      case ts.SyntaxKind.ExpressionStatement:
        var expr = <ts.ExpressionStatement>node;
        this.visit(expr.expression);
        this.emit(';');
        break;
      case ts.SyntaxKind.SwitchStatement:
        var switchStmt = <ts.SwitchStatement>node;
        this.emit('switch (');
        this.visit(switchStmt.expression);
        this.emit(')');
        this.visit(switchStmt.caseBlock);
        break;
      case ts.SyntaxKind.CaseBlock:
        this.emit('{');
        this.visitEach((<ts.CaseBlock>node).clauses);
        this.emit('}');
        break;
      case ts.SyntaxKind.CaseClause:
        var caseClause = <ts.CaseClause>node;
        this.emit('case');
        this.visit(caseClause.expression);
        this.emit(':');
        this.visitEach(caseClause.statements);
        break;
      case ts.SyntaxKind.DefaultClause:
        this.emit('default :');
        this.visitEach((<ts.DefaultClause>node).statements);
        break;
      case ts.SyntaxKind.IfStatement:
        var ifStmt = <ts.IfStatement>node;
        this.emit('if (');
        this.visit(ifStmt.expression);
        this.emit(')');
        this.visit(ifStmt.thenStatement);
        if (ifStmt.elseStatement) {
          this.emit('else');
          this.visit(ifStmt.elseStatement);
        }
        break;

      case ts.SyntaxKind.ForStatement:
        var forStmt = <ts.ForStatement>node;
        this.emit('for (');
        if (forStmt.initializer) this.visit(forStmt.initializer);
        this.emit(';');
        if (forStmt.condition) this.visit(forStmt.condition);
        this.emit(';');
        if (forStmt.iterator) this.visit(forStmt.iterator);
        this.emit(')');
        this.visit(forStmt.statement);
        break;
      case ts.SyntaxKind.ForInStatement:
        // TODO(martinprobst): Dart's for-in loops actually have different semantics, they are more
        // like for-of loops, iterating over collections.
        var forInStmt = <ts.ForInStatement>node;
        this.emit('for (');
        if (forInStmt.initializer) this.visit(forInStmt.initializer);
        this.emit('in');
        this.visit(forInStmt.expression);
        this.emit(')');
        this.visit(forInStmt.statement);
        break;
      case ts.SyntaxKind.WhileStatement:
        var whileStmt = <ts.WhileStatement>node;
        this.emit('while (');
        this.visit(whileStmt.expression);
        this.emit(')');
        this.visit(whileStmt.statement);
        break;
      case ts.SyntaxKind.DoStatement:
        var doStmt = <ts.DoStatement>node;
        this.emit('do');
        this.visit(doStmt.statement);
        this.emit('while (');
        this.visit(doStmt.expression);
        this.emit(') ;');
        break;

      case ts.SyntaxKind.TryStatement:
        var tryStmt = <ts.TryStatement>node;
        this.emit('try');
        this.visit(tryStmt.tryBlock);
        if (tryStmt.catchClause) {
          this.visit(tryStmt.catchClause);
        }
        if (tryStmt.finallyBlock) {
          this.emit('finally');
          this.visit(tryStmt.finallyBlock);
        }
        break;
      case ts.SyntaxKind.CatchClause:
        var ctch = <ts.CatchClause>node;
        if (ctch.variableDeclaration.type) {
          this.emit('on');
          this.visit(ctch.variableDeclaration.type);
        }
        this.emit('catch');
        this.emit('(');
        this.visit(ctch.variableDeclaration.name);
        this.emit(')');
        this.visit(ctch.block);
        break;

      // Literals.
      case ts.SyntaxKind.NumericLiteral:
        var sLit = <ts.LiteralExpression>node;
        this.emit(sLit.getText());
        break;
      case ts.SyntaxKind.StringLiteral:
        var sLit = <ts.LiteralExpression>node;
        var text = JSON.stringify(sLit.text);
        // Escape dollar sign since dart will interpolate in double quoted literal
        var text = text.replace(/\$/, '\\$');
        this.emit(text);
        break;
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        this.emit(`'''${this.escapeTextForTemplateString(node)}'''`);
        break;
      case ts.SyntaxKind.TemplateMiddle:
        this.result += this.escapeTextForTemplateString(node);
        break;
      case ts.SyntaxKind.TemplateExpression:
        var tmpl = <ts.TemplateExpression>node;
        if (tmpl.head) this.visit(tmpl.head);
        if (tmpl.templateSpans) this.visitEach(tmpl.templateSpans);
        break;
      case ts.SyntaxKind.TemplateHead:
        this.emit(`'''${this.escapeTextForTemplateString(node)}`); //highlighting bug:'
        break;
      case ts.SyntaxKind.TemplateTail:
        this.result += `${this.escapeTextForTemplateString(node)}'''`; //highlighting bug:'
        break;
      case ts.SyntaxKind.TemplateSpan:
        var span = <ts.TemplateSpan>node;
        if (span.expression) {
          // Do not emit extra whitespace inside the string template
          this.result += '${';
          this.visit(span.expression);
          this.result += '}';
        }
        if (span.literal) this.visit(span.literal);
        break;
      case ts.SyntaxKind.ArrayLiteralExpression:
        this.emit('[');
        this.visitList((<ts.ArrayLiteralExpression>node).elements);
        this.emit(']');
        break;
      case ts.SyntaxKind.ObjectLiteralExpression:
        this.emit('{');
        this.visitList((<ts.ObjectLiteralExpression>node).properties);
        this.emit('}');
        break;
      case ts.SyntaxKind.PropertyAssignment:
        var propAssign = <ts.PropertyAssignment>node;
        if (propAssign.name.kind === ts.SyntaxKind.Identifier) {
          // Dart identifiers in Map literals need quoting.
          this.result += ' "';
          this.result += (<ts.Identifier>propAssign.name).text;
          this.result += '"';
        } else {
          this.visit(propAssign.name);
        }
        this.emit(':');
        this.visit(propAssign.initializer);
        break;
      case ts.SyntaxKind.TrueKeyword:
        this.emit('true');
        break;
      case ts.SyntaxKind.FalseKeyword:
        this.emit('false');
        break;
      case ts.SyntaxKind.NullKeyword:
        this.emit('null');
        break;
      case ts.SyntaxKind.RegularExpressionLiteral:
        this.emit((<ts.LiteralExpression>node).text);
        break;
      case ts.SyntaxKind.ThisKeyword:
        this.emit('this');
        break;
      case ts.SyntaxKind.StaticKeyword:
        this.emit('static');
        break;
      case ts.SyntaxKind.PrivateKeyword:
        // no-op, handled through '_' naming convention in Dart.
        break;
      case ts.SyntaxKind.ProtectedKeyword:
        // Error - handled in `visitDeclarationModifiers` above.
        break;
      case ts.SyntaxKind.PropertyAccessExpression:
        var propAccess = <ts.PropertyAccessExpression>node;
        this.visit(propAccess.expression);
        this.emit('.');
        this.visit(propAccess.name);
        break;
      case ts.SyntaxKind.ElementAccessExpression:
        var elemAccess = <ts.ElementAccessExpression>node;
        this.visit(elemAccess.expression);
        this.emit('[');
        this.visit(elemAccess.argumentExpression);
        this.emit(']');
        break;
      case ts.SyntaxKind.NewExpression:
        this.emit('new');
        this.visitCall(<ts.NewExpression>node);
        break;
      case ts.SyntaxKind.CallExpression:
        var callExpr = <ts.CallExpression>node;
        if (!this.maybeHandleSuperCall(callExpr)) {
          this.visitCall(callExpr);
        }
        break;
      case ts.SyntaxKind.BinaryExpression:
        var binExpr = <ts.BinaryExpression>node;
        var operatorKind = binExpr.operatorToken.kind;
        if (operatorKind === ts.SyntaxKind.EqualsEqualsEqualsToken || operatorKind === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
          if (operatorKind === ts.SyntaxKind.ExclamationEqualsEqualsToken) this.emit('!');
          this.emit('identical (');
          this.visit(binExpr.left);
          this.emit(',');
          this.visit(binExpr.right);
          this.emit(')');
        } else {
          this.visit(binExpr.left);
          if (operatorKind === ts.SyntaxKind.InstanceOfKeyword) {
            this.emit('is');
          } else {
            this.emit(ts.tokenToString(binExpr.operatorToken.kind));
          }
          this.visit(binExpr.right);
        }
        break;
      case ts.SyntaxKind.PrefixUnaryExpression:
        var prefixUnary = <ts.PrefixUnaryExpression>node;
        this.emit(ts.tokenToString(prefixUnary.operator));
        this.visit(prefixUnary.operand);
        break;
      case ts.SyntaxKind.PostfixUnaryExpression:
        var postfixUnary = <ts.PostfixUnaryExpression>node;
        this.visit(postfixUnary.operand);
        this.emit(ts.tokenToString(postfixUnary.operator));
        break;
      case ts.SyntaxKind.ConditionalExpression:
        var conditional = <ts.ConditionalExpression>node;
        this.visit(conditional.condition);
        this.emit('?');
        this.visit(conditional.whenTrue);
        this.emit(':');
        this.visit(conditional.whenFalse);
        break;
      case ts.SyntaxKind.DeleteExpression:
        this.reportError(node, 'delete operator is unsupported');
        break;
      case ts.SyntaxKind.VoidExpression:
        this.reportError(node, 'void operator is unsupported');
        break;
      case ts.SyntaxKind.TypeOfExpression:
        this.reportError(node, 'typeof operator is unsupported');
        break;

      case ts.SyntaxKind.QualifiedName:
        var first = <ts.QualifiedName>node;
        this.visit(first.left);
        this.emit('.');
        this.visit(first.right);
        break;
      case ts.SyntaxKind.Identifier:
        var ident = <ts.Identifier>node;
        this.emit(ident.text);
        break;

      case ts.SyntaxKind.TypeLiteral:
        // Dart doesn't support type literals.
        this.emit('dynamic');
        break;

      case ts.SyntaxKind.TypeReference:
        var typeRef = <ts.TypeReferenceNode>node;
        this.visit(typeRef.typeName);
        if (typeRef.typeArguments) {
          this.emit('<');
          this.visitList(typeRef.typeArguments);
          this.emit('>');
        }
        break;
      case ts.SyntaxKind.TypeParameter:
        var typeParam = <ts.TypeParameterDeclaration>node;
        this.visit(typeParam.name);
        if (typeParam.constraint) {
          this.emit('extends');
          this.visit(typeParam.constraint);
        }
        break;

      // Classes & Interfaces
      case ts.SyntaxKind.ClassDeclaration:
        var classDecl = <ts.ClassDeclaration>node;
        this.visitClassLike('class', classDecl);
        break;

      case ts.SyntaxKind.InterfaceDeclaration:
        var ifDecl = <ts.InterfaceDeclaration>node;
        this.visitClassLike('abstract class', ifDecl);
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
        this.visitConstructorBody(ctorDecl);
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
        this.visitFunctionLike(<ts.AccessorDeclaration>node, 'get');
        break;
      case ts.SyntaxKind.SetAccessor:
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

      case ts.SyntaxKind.EmptyStatement:
        this.emit(';');
        break;
      case ts.SyntaxKind.ReturnStatement:
        var retStmt = <ts.ReturnStatement>node;
        this.emit('return');
        if (retStmt.expression) this.visit(retStmt.expression);
        this.emit(';');
        break;
      case ts.SyntaxKind.BreakStatement:
      case ts.SyntaxKind.ContinueStatement:
        var breakContinue = <ts.BreakOrContinueStatement>node;
        this.emit(breakContinue.kind == ts.SyntaxKind.BreakStatement ? 'break' : 'continue');
        if (breakContinue.label) this.visit(breakContinue.label);
        this.emit(';');
        break;
      case ts.SyntaxKind.ThrowStatement:
        this.emit('throw');
        this.visit((<ts.ThrowStatement>node).expression);
        this.emit(';');
        break;

      case ts.SyntaxKind.Block:
        this.emit('{');
        this.visitEach((<ts.Block>node).statements);
        this.emit('}');
        break;

      case ts.SyntaxKind.ImportDeclaration:
        var importDecl = <ts.ImportDeclaration>node;
        this.emit('import');
        this.visitExternalModuleReferenceExpr(importDecl.moduleSpecifier);
        if (importDecl.importClause) {
          this.visit(importDecl.importClause);
        } else {
          this.reportError(importDecl, 'bare import is unsupported');
        }
        this.emit(';');
        break;
      case ts.SyntaxKind.ImportClause:
        var importClause = <ts.ImportClause>node;
        if (importClause.name) this.visit(importClause.name);
        if (importClause.namedBindings) {
          this.visit(importClause.namedBindings);
        }
        break;
      case ts.SyntaxKind.NamespaceImport:
        var nsImport = <ts.NamespaceImport>node;
        this.emit('as');
        this.visit(nsImport.name);
        break;
      case ts.SyntaxKind.NamedImports:
      case ts.SyntaxKind.NamedExports:
        this.emit('show');
        this.visitList((<ts.NamedImportsOrExports>node).elements);
        break;
      case ts.SyntaxKind.ImportSpecifier:
      case ts.SyntaxKind.ExportSpecifier:
        var spec = <ts.ImportOrExportSpecifier>node;
        if (spec.propertyName) this.visit(spec.propertyName);
        this.visit(spec.name);
        break;
      case ts.SyntaxKind.ExportDeclaration:
        var exportDecl = <ts.ExportDeclaration>node;
        this.emit('export');
        this.visitExternalModuleReferenceExpr(exportDecl.moduleSpecifier);
        if (exportDecl.exportClause) this.visit(exportDecl.exportClause);
        this.emit(';');
        break;
      case ts.SyntaxKind.ImportEqualsDeclaration:
        var importEqDecl = <ts.ImportEqualsDeclaration>node;
        this.emit('import');
        this.visit(importEqDecl.moduleReference);
        this.emit('as');
        this.visit(importEqDecl.name);
        this.emit(';');
        break;
      case ts.SyntaxKind.ExternalModuleReference:
        this.visitExternalModuleReferenceExpr((<ts.ExternalModuleReference>node).expression);
        break;

      default:
        this.reportError(node,
            `Unsupported node type ${(<any>ts).SyntaxKind[node.kind]}: ${node.getFullText()}`);
        break;
    }
  }
}

export interface TranspileOptions {
  failFast?: boolean
}

export function translateProgram(program: ts.Program,
                                 {failFast = false}: TranspileOptions = {}): string {
  return program.getSourceFiles()
      .filter((sourceFile: ts.SourceFile) => sourceFile.fileName.indexOf(".d.ts") < 0)
      .map((f) => new Translator(failFast).translate(f))
      .join('\n');
}

var options: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES6,
  module: ts.ModuleKind.CommonJS,
  allowNonTsExtensions: true
};

export function translateFile(fileName: string): string {
  var host = ts.createCompilerHost(options, /*setParentNodes*/ true);
  var program = ts.createProgram([fileName], options, host);
  return translateProgram(program);
}

export function translateFiles(fileNames: string[]): void {
  var host = ts.createCompilerHost(options, /*setParentNodes*/ true);
  var program = ts.createProgram(fileNames, options, host);
  program.getSourceFiles()
      .filter((sourceFile: ts.SourceFile) => sourceFile.fileName.indexOf(".d.ts") < 0)
      .forEach(function(f: ts.SourceFile) {
    var dartCode = new Translator().translate(f);
    var dartFile = f.fileName.replace(/.ts$/, '.dart');
    require('fs').writeFileSync(dartFile, dartCode);
  });
}

// CLI entry point
if (require.main === module) {
  translateFiles(process.argv.slice(2));
}
