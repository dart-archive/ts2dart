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

  function emitDart(sourceFile: ts.SourceFile) {
    visit(sourceFile);

    function visit(node: ts.Node) {
      //console.log(`${(<any>ts).SyntaxKind[node.kind]}: ${node.getText()}`);
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
            result += ' =';
            visit(varDecl.initializer);
          }
          break;

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

        case ts.SyntaxKind.VariableStatement:
          ts.forEachChild(node, visit);
          result += ';\n';
          break;

        case ts.SyntaxKind.FirstAssignment:
        case ts.SyntaxKind.FirstLiteralToken:
        case ts.SyntaxKind.Identifier:
          result += ` ${node.getText() }`;
          break;

        default:
          throw new Error("Unsupported node type " + (<any>ts).SyntaxKind[node.kind]);
      }
    }
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
