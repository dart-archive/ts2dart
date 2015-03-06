/// <reference path="typings/node/node.d.ts" />

// not needed by tsc since we require typescript external module,
// but the editor/IDE doesn't give completions without it
/// <reference path="typings/typescript/typescript.d.ts" />

import ts = require("typescript");

export function translateProgram(program: ts.Program): string {
  var result: string = "";
  program.getSourceFiles()
      .filter((sourceFile: ts.SourceFile) => sourceFile.filename.indexOf(".d.ts") < 0)
      .forEach(emitDart);
  return result;

  function emit(str: string) {
    result += ' ';
    result += str;
  }

  function visitEach(nodes) {
    nodes.forEach(visit);
  }

  function visitList(nodes: ts.NodeArray<ts.Node> ) {
    for (var i = 0; i < nodes.length; i++) {
      visit(nodes[i]);
      if (i < nodes.length - 1) emit(',');
    }
  }

        case ts.SyntaxKind.FunctionDeclaration:
          var funcDecl= <ts.FunctionDeclaration>node;
          visit(funcDecl.type);
          visit(funcDecl.name);
          result += '(';
          result += ') {';
          result += '}';
          break;

        case ts.SyntaxKind.NumberKeyword:
          result += ' num';
          break;
        case ts.SyntaxKind.VoidKeyword:
          result += ' void';
          break;
  function visit(node: ts.Node) {
    // console.log(`Node kind: ${node.kind} ${node.getText()}`);
    switch (node.kind) {
    case ts.SyntaxKind.SourceFile:
    case ts.SyntaxKind.EndOfFileToken:
      ts.forEachChild(node, visit);
      break;

    case ts.SyntaxKind.VariableDeclaration:
      var varDecl = <ts.VariableDeclaration>node;
      visit(varDecl.type);
      visit(varDecl.name);
      if (varDecl.initializer) {
        emit('=');
        visit(varDecl.initializer);
      }
      break;

    case ts.SyntaxKind.NumberKeyword:
      emit('num');
      break;

    case ts.SyntaxKind.VariableStatement:
      ts.forEachChild(node, visit);
      emit(';\n');
      break;

    case ts.SyntaxKind.FirstAssignment:
    case ts.SyntaxKind.FirstLiteralToken:
    case ts.SyntaxKind.Identifier:
      emit(node.getText());
      break;

    case ts.SyntaxKind.TypeReference:
      var typeRef = <ts.TypeReferenceNode>node;
      visit(typeRef.typeName);
      if (typeRef.typeArguments) {
        visitEach(typeRef.typeArguments);
        default:
          throw new Error("Unsupported node type " + (<any>ts).SyntaxKind[node.kind]);
      }
      break;

    case ts.SyntaxKind.ClassDeclaration:
      var classDecl = <ts.ClassDeclaration>node;
      emit('class');
      visit(classDecl.name);
      if (classDecl.typeParameters) {
        visitEach(classDecl.typeParameters);
      }
      if (classDecl.heritageClauses) {
        visitEach(classDecl.heritageClauses);
      }

      if (classDecl.members) {
        emit('{\n');
        visitEach(classDecl.members);
        emit('}\n');
      }
      break;

    case ts.SyntaxKind.HeritageClause:
      var heritageClause = <ts.HeritageClause>node;
      if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
        emit('extends');
      } else {
        emit('implements');
      }
      // Can only have one member for extends clauses.
      visitList(heritageClause.types);
      break;

    default:
      throw new Error("Unsupported node type " + node.kind);
    }
  }
  function emitDart(sourceFile: ts.SourceFile) {
    visit(sourceFile);
  }
}

export function translateFiles(fileNames: string[]): string {
  var options: ts.CompilerOptions = { target: ts.ScriptTarget.ES6, module: ts.ModuleKind.CommonJS };
  var host = ts.createCompilerHost(options);
  var program = ts.createProgram(fileNames, options, host);
  return translateProgram(program);
}

// CLI entry point
translateFiles(process.argv.slice(2));
