/// <reference path="typings/node/node.d.ts" />

// not needed by tsc since we require typescript external module,
// but the editor/IDE doesn't give completions without it
/// <reference path="typings/typescript/typescript.d.ts" />

import ts = require("typescript");

class Translator {
  result: string = '';
  lastCommentIdx: number = -1;

  translate(sourceFile: ts.SourceFile) {
    this.visit(sourceFile);
    return this.result;
  }

  emit(str: string) {
    this.result += ' ';
    this.result += str;
  }

  visitEach(nodes: ts.Node[]) {
    nodes.forEach((n) => this.visit(n));
  }

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

  reportError(n: ts.Node, message: string) {
    var file = n.getSourceFile();
    var start = n.getStart();
    var pos = file.getLineAndCharacterFromPosition(start);
    throw new Error(`${file.filename}:${pos.line}:${pos.character}: ${message}`);
  }

  // Comments attach to all following AST nodes before the next 'physical' token. Track the earliest
  // offset to avoid printing comments multiple times.
  // TODO(martinprobst): Refactor this.

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

      case ts.SyntaxKind.VariableDeclaration:
        var varDecl = <ts.VariableDeclaration>node;
        this.visit(varDecl.type);
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

      case ts.SyntaxKind.VariableStatement:
        ts.forEachChild(node, this.visit.bind(this));
        this.emit(';\n');
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
        this.emit(') {');
        this.visitEach(switchStmt.clauses);
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

      case ts.SyntaxKind.BreakStatement:
        this.emit('break ;');
        break;

      // Literals.
      case ts.SyntaxKind.StringLiteral:
        var sLit = <ts.StringLiteralExpression>node;
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
        this.emit((<ts.LiteralExpression>node).text);
        break;

      case ts.SyntaxKind.FirstAssignment:
      case ts.SyntaxKind.FirstLiteralToken:
      case ts.SyntaxKind.Identifier:
        this.emit(node.getText());
        break;

      case ts.SyntaxKind.TypeReference:
        var typeRef = <ts.TypeReferenceNode>node;
        this.visit(typeRef.typeName);
        if (typeRef.typeArguments) {
          this.visitEach(typeRef.typeArguments);
        }
        break;

      case ts.SyntaxKind.ClassDeclaration:
        var classDecl = <ts.ClassDeclaration>node;
        this.emit('class');
        this.visit(classDecl.name);
        if (classDecl.typeParameters) {
          this.visitEach(classDecl.typeParameters);
        }
        if (classDecl.heritageClauses) {
          this.visitEach(classDecl.heritageClauses);
        }

        if (classDecl.members) {
          this.emit('{\n');
          this.visitEach(classDecl.members);
          this.emit('}\n');
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
        this.visit(className);
        this.visitFunctionLike(ctorDecl);
        break;

      case ts.SyntaxKind.Property:
        var propertyDecl = <ts.PropertyDeclaration>node;
        this.visit(propertyDecl.type);
        this.visit(propertyDecl.name);
        if (propertyDecl.initializer) {
          this.emit('=');
          this.visit(propertyDecl.initializer);
        }
        this.emit(';');
        break;

      case ts.SyntaxKind.Method:
        var methodDecl = <ts.MethodDeclaration>node;
        if (methodDecl.type) this.visit(methodDecl.type);
        this.visit(methodDecl.name);
        this.visitFunctionLike(methodDecl);
        break;

      case ts.SyntaxKind.FunctionDeclaration:
        var funcDecl = <ts.FunctionDeclaration>node;
        if (funcDecl.type) this.visit(funcDecl.type);
        this.visit(funcDecl.name);
        this.visitFunctionLike(funcDecl);
        break;

      case ts.SyntaxKind.Parameter:
        var paramDecl = <ts.ParameterDeclaration>node;
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
        this.visit((<ts.ReturnStatement>node).expression);
        this.emit(';');
        break;

      case ts.SyntaxKind.Block:
        this.emit('{');
        this.visitEach((<ts.Block>node).statements);
        this.emit('}');
        break;

      default:
        this.reportError(node, "Unsupported node type " + (<any>ts).SyntaxKind[node.kind]);
        break;
    }
  }
}

export function translateProgram(program: ts.Program): string {
  var result = program.getSourceFiles()
      .filter((sourceFile: ts.SourceFile) => sourceFile.filename.indexOf(".d.ts") < 0)
      .forEach((f) => {
        var tr = new Translator();
        return tr.translate(f);
      })
      .join('');
  return result;

}

export function translateFiles(fileNames: string[]): string {
  var options: ts.CompilerOptions = { target: ts.ScriptTarget.ES6, module: ts.ModuleKind.CommonJS };
  var host = ts.createCompilerHost(options);
  var program = ts.createProgram(fileNames, options, host);
  return translateProgram(program);
}

// CLI entry point
translateFiles(process.argv.slice(2));
