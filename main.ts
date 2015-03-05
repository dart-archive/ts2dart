/// <reference path="typings/node/node.d.ts" />

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
            //console.log(`${ts.SyntaxKind[node.kind]}: ${node.getText()}`);
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

                case ts.SyntaxKind.NumberKeyword:
                    result += ' num';
                    break;

                case ts.SyntaxKind.VariableStatement:
                    ts.forEachChild(node, visit);
                    result += ';\n';
                    break;

                case ts.SyntaxKind.FirstAssignment:
                case ts.SyntaxKind.FirstLiteralToken:
                case ts.SyntaxKind.Identifier:
                    result += ` ${node.getText()}`;
                    break;

                default:
                    throw new Error("Unsupported node type " + ts.SyntaxKind[node.kind]);
            }

        }
    }
}

var fileNames = process.argv.slice(2);
var options: ts.CompilerOptions = { target: ts.ScriptTarget.ES6, module: ts.ModuleKind.CommonJS };
var host = ts.createCompilerHost(options);
var program = ts.createProgram(fileNames, options, host);
translateProgram(program);
