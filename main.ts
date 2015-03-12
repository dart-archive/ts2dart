/// <reference path="typings/node/node.d.ts" />
// Use HEAD version of typescript, installed by npm
/// <reference path="node_modules/typescript/bin/typescript.d.ts" />

import ts = require("typescript");

class Translator {
  result: string = '';
  // Comments attach to all following AST nodes before the next 'physical' token. Track the earliest
  // offset to avoid printing comments multiple times.
  lastCommentIdx: number = -1;

  translate(sourceFile: ts.SourceFile) {
    this.visit(sourceFile);
    return this.result;
  }

  emit(str: string) {
    this.result += ' ';
    this.result += str;
  }

  visitEach(nodes: ts.Node[]) { nodes.forEach((n) => this.visit(n)); }

  visitList(nodes: ts.NodeArray<ts.Node>) {
    for (var i = 0; i < nodes.length; i++) {
      this.visit(nodes[i]);
      if (i < nodes.length - 1) this.emit(',');
    }
  }

  visitFunctionLike(fn: ts.FunctionLikeDeclaration) {
    this.emit('(');
    this.visitList(fn.parameters);
    this.emit(')');
    this.visit(fn.body);
  }

  visitClassLike(decl: ts.ClassDeclaration | ts.InterfaceDeclaration) {
    this.visit(decl.name);
    if (decl.typeParameters) {
      this.emit('<');
      this.visitList(decl.typeParameters);
      this.emit('>');
    }
    if (decl.heritageClauses) {
      this.visitEach(decl.heritageClauses);
    }
    this.emit('{');
    if (decl.members) {
      this.visitEach(decl.members);
    }
    this.emit('}');
  }

  visitCall(c: ts.CallExpression) {
    this.visit(c.expression);
    this.emit('(');
    this.visitList(c.arguments);
    this.emit(')');
  }

  reportError(n: ts.Node, message: string) {
    var file = n.getSourceFile();
    var start = n.getStart();
    var pos = file.getLineAndCharacterOfPosition(start);
    throw new Error(`${file.fileName}:${pos.line}:${pos.character}: ${message}`);
  }

  visit(node: ts.Node) {
    // console.log(`Node kind: ${node.kind} ${node.getText()}`);
    var comments = ts.getLeadingCommentRanges(node.getSourceFile().text, node.getFullStart());
    if (comments) {
      comments.forEach((c) => {
        if (c.pos <= this.lastCommentIdx) return;
        this.lastCommentIdx = c.pos;
        var text = node.getSourceFile().text.substring(c.pos, c.end);
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
        var varDeclList = <ts.VariableDeclarationList> node;
        this.visitEach(varDeclList.declarations);
        break;

      case ts.SyntaxKind.VariableDeclaration:
        var varDecl = <ts.VariableDeclaration> node;
        if (varDecl.type) {
          this.visit(varDecl.type);
        } else {
          this.emit('var');
        }
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

      case ts.SyntaxKind.ParenthesizedExpression:
        var parenExpr = <ts.ParenthesizedExpression> node;
        this.emit('(');
        this.visit(parenExpr.expression);
        this.emit(')');
        break;

      case ts.SyntaxKind.VariableStatement:
        ts.forEachChild(node, this.visit.bind(this));
        this.emit(';\n');
        break;
      case ts.SyntaxKind.ExpressionStatement:
        var expr = <ts.ExpressionStatement> node;
        this.visit(expr.expression);
        this.emit(';');
        break;
      case ts.SyntaxKind.SwitchStatement:
        var switchStmt = <ts.SwitchStatement> node;
        this.emit('switch (');
        this.visit(switchStmt.expression);
        this.emit(') {');
        this.visitEach(switchStmt.clauses);
        this.emit('}');
        break;
      case ts.SyntaxKind.CaseClause:
        var caseClause = <ts.CaseClause> node;
        this.emit('case');
        this.visit(caseClause.expression);
        this.emit(':');
        this.visitEach(caseClause.statements);
        break;
      case ts.SyntaxKind.DefaultClause:
        this.emit('default :');
        this.visitEach((<ts.DefaultClause> node).statements);
        break;
      case ts.SyntaxKind.IfStatement:
        var ifStmt = <ts.IfStatement> node;
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
        var forStmt = <ts.ForStatement> node;
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
        var forInStmt = <ts.ForInStatement> node;
        this.emit('for (');
        if (forInStmt.initializer) this.visit(forInStmt.initializer);
        this.emit('in');
        this.visit(forInStmt.expression);
        this.emit(')');
        this.visit(forInStmt.statement);
        break;
      case ts.SyntaxKind.WhileStatement:
        var whileStmt = <ts.WhileStatement> node;
        this.emit('while (');
        this.visit(whileStmt.expression);
        this.emit(')');
        this.visit(whileStmt.statement);
        break;
      case ts.SyntaxKind.DoStatement:
        var doStmt = <ts.DoStatement> node;
        this.emit('do');
        this.visit(doStmt.statement);
        this.emit('while (');
        this.visit(doStmt.expression);
        this.emit(') ;');
        break;

      case ts.SyntaxKind.BreakStatement:
        this.emit('break ;');
        break;

      // Literals.
      case ts.SyntaxKind.NumericLiteral:
        var sLit = <ts.LiteralExpression> node;
        this.emit(sLit.getText());
        break;
      case ts.SyntaxKind.StringLiteral:
        var sLit = <ts.LiteralExpression> node;
        this.emit(JSON.stringify(sLit.text));
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
        this.emit((<ts.LiteralExpression> node).text);
        break;
      case ts.SyntaxKind.ThisKeyword:
        this.emit('this');
        break;

      case ts.SyntaxKind.PropertyAccessExpression:
        var propAccess = <ts.PropertyAccessExpression> node;
        this.visit(propAccess.expression);
        this.emit('.');
        this.visit(propAccess.name);
        break;
      case ts.SyntaxKind.ElementAccessExpression:
        var elemAccess = <ts.ElementAccessExpression> node;
        this.visit(elemAccess.expression);
        this.emit('[');
        this.visit(elemAccess.argumentExpression);
        this.emit(']');
        break;
      case ts.SyntaxKind.NewExpression:
        this.emit('new');
        this.visitCall(<ts.NewExpression> node);
        break;
      case ts.SyntaxKind.CallExpression:
        this.visitCall(<ts.CallExpression> node);
        break;
      case ts.SyntaxKind.BinaryExpression:
        var binExpr = <ts.BinaryExpression> node;
        this.visit(binExpr.left);
        this.emit(ts.tokenToString(binExpr.operatorToken.kind));
        this.visit(binExpr.right);
        break;
      case ts.SyntaxKind.PrefixUnaryExpression:
        var prefixUnary = <ts.PrefixUnaryExpression> node;
        this.emit(ts.tokenToString(prefixUnary.operator));
        this.visit(prefixUnary.operand);
        break;
      case ts.SyntaxKind.PostfixUnaryExpression:
        var postfixUnary = <ts.PostfixUnaryExpression> node;
        this.visit(postfixUnary.operand);
        this.emit(ts.tokenToString(postfixUnary.operator));
        break;
      case ts.SyntaxKind.ConditionalExpression:
        var conditional = <ts.ConditionalExpression> node;
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

      case ts.SyntaxKind.Identifier:
        this.emit(node.getText());
        break;

      case ts.SyntaxKind.TypeReference:
        var typeRef = <ts.TypeReferenceNode> node;
        this.visit(typeRef.typeName);
        if (typeRef.typeArguments) {
          this.emit('<');
          this.visitList(typeRef.typeArguments);
          this.emit('>');
        }
        break;
      case ts.SyntaxKind.TypeParameter:
        var typeParam = <ts.TypeParameterDeclaration> node;
        this.visit(typeParam.name);
        if (typeParam.constraint) {
          this.emit('extends');
          this.visit(typeParam.constraint);
        }
        break;

      case ts.SyntaxKind.ClassDeclaration:
        var classDecl = <ts.ClassDeclaration> node;
        this.emit('class');
        this.visitClassLike(classDecl);
        break;

      case ts.SyntaxKind.InterfaceDeclaration:
        var ifDecl = <ts.InterfaceDeclaration> node;
        this.emit('abstract class');
        this.visitClassLike(ifDecl);
        break;

      case ts.SyntaxKind.HeritageClause:
        var heritageClause = <ts.HeritageClause> node;
        if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
          this.emit('extends');
        } else {
          this.emit('implements');
        }
        // Can only have one member for extends clauses.
        this.visitList(heritageClause.types);
        break;

      case ts.SyntaxKind.Constructor:
        var ctorDecl = <ts.ConstructorDeclaration> node;
        // Find containing class name.
        var className;
        for (var parent = ctorDecl.parent; parent; parent = parent.parent) {
          if (parent.kind == ts.SyntaxKind.ClassDeclaration) {
            className = (<ts.ClassDeclaration> parent).name;
            break;
          }
        }
        if (!className) this.reportError(ctorDecl, 'cannot find outer class node');
        this.visit(className);
        this.visitFunctionLike(ctorDecl);
        break;

      case ts.SyntaxKind.PropertyDeclaration:
        var propertyDecl = <ts.PropertyDeclaration> node;
        this.visit(propertyDecl.type);
        this.visit(propertyDecl.name);
        if (propertyDecl.initializer) {
          this.emit('=');
          this.visit(propertyDecl.initializer);
        }
        this.emit(';');
        break;

      case ts.SyntaxKind.MethodDeclaration:
        var methodDecl = <ts.MethodDeclaration> node;
        if (methodDecl.type) this.visit(methodDecl.type);
        this.visit(methodDecl.name);
        this.visitFunctionLike(methodDecl);
        break;

      case ts.SyntaxKind.FunctionDeclaration:
        var funcDecl = <ts.FunctionDeclaration> node;
        if (funcDecl.typeParameters) this.reportError(node, 'generic functions are unsupported');
        if (funcDecl.type) this.visit(funcDecl.type);
        this.visit(funcDecl.name);
        this.visitFunctionLike(funcDecl);
        break;

      case ts.SyntaxKind.Parameter:
        var paramDecl = <ts.ParameterDeclaration> node;
        if (paramDecl.dotDotDotToken) this.reportError(node, 'rest parameters are unsupported');
        if (paramDecl.initializer) this.emit('[');
        if (paramDecl.type) this.visit(paramDecl.type);
        this.visit(paramDecl.name);
        if (paramDecl.initializer) {
          this.emit('=');
          this.visit(paramDecl.initializer);
          this.emit(']');
        }
        break;

      case ts.SyntaxKind.ReturnStatement:
        this.emit('return');
        this.visit((<ts.ReturnStatement> node).expression);
        this.emit(';');
        break;

      case ts.SyntaxKind.Block:
        this.emit('{');
        this.visitEach((<ts.Block> node).statements);
        this.emit('}');
        break;

      case ts.SyntaxKind.ImportEqualsDeclaration:
        var importEqDecl = <ts.ImportEqualsDeclaration> node;
        this.emit('import');
        // Dart doesn't allow assigning a different name to the imported module
        // so this is currently lost in translation.
        // this.visit(importEqDecl.name);
        this.visit(importEqDecl.moduleReference);
        this.emit(';');
        break;

      case ts.SyntaxKind.ExternalModuleReference:
        var externalModRef = <ts.ExternalModuleReference> node;
        // TODO: what if this isn't a string literal?
        var moduleName = <ts.StringLiteralExpression> externalModRef.expression;
        moduleName.text = 'package:' + moduleName.text;
        this.visit(externalModRef.expression);
        break;

      default:
        this.reportError(node, "Unsupported node type " + (<any> ts).SyntaxKind[node.kind]);
        break;
    }
  }
}

export function translateProgram(program: ts.Program): string {
  var result = program.getSourceFiles()
                   .filter((sourceFile: ts.SourceFile) => sourceFile.fileName.indexOf(".d.ts") < 0)
                   .map((f) =>
                        {
                          var tr = new Translator();
                          return tr.translate(f);
                        })
                   .join('\n');
  return result;
}

export function translateFiles(fileNames: string[]): string {
  var options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES6,
    module: ts.ModuleKind.CommonJS
  };
  var host = ts.createCompilerHost(options);
  var program = ts.createProgram(fileNames, options, host);
  return translateProgram(program);
}

// CLI entry point
translateFiles(process.argv.slice(2));
