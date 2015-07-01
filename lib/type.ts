/// <reference path='../node_modules/typescript/bin/typescript.d.ts' />
import ts = require('typescript');
import base = require('./base');
import ts2dart = require('./main');
import {FacadeConverter} from './facade_converter';

class TypeTranspiler extends base.TranspilerBase {
  constructor(tr: ts2dart.Transpiler, private fc: FacadeConverter) { super(tr); }

  visitNode(node: ts.Node): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.TypeLiteral:
        // Dart doesn't support type literals.
        this.emit('dynamic');
        break;
      case ts.SyntaxKind.UnionType:
        this.emit('dynamic /*');
        this.visitList((<ts.UnionTypeNode>node).types, "|");
        this.emit('*/');
        break;
      case ts.SyntaxKind.TypeReference:
        var typeRef = <ts.TypeReferenceNode>node;
        this.fc.visitTypeName(typeRef.typeName);
        this.maybeVisitTypeArguments(typeRef);
        break;
      case ts.SyntaxKind.TypeAssertionExpression:
        var typeAssertExpr = <ts.TypeAssertion>node;
        this.emit('(');
        this.visit(typeAssertExpr.expression);
        this.emit('as');
        this.visit(typeAssertExpr.type);
        this.emit(')');
        break;
      case ts.SyntaxKind.TypeParameter:
        var typeParam = <ts.TypeParameterDeclaration>node;
        this.visit(typeParam.name);
        if (typeParam.constraint) {
          this.emit('extends');
          this.visit(typeParam.constraint);
        }
        break;
      case ts.SyntaxKind.ArrayType:
        this.emit('List');
        this.emit('<');
        this.visit((<ts.ArrayTypeNode>node).elementType);
        this.emit('>');
        break;
      case ts.SyntaxKind.FunctionType:
        this.emit('dynamic /*');
        this.emit(node.getText());
        this.emit('*/');
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
      case ts.SyntaxKind.NumberKeyword:
        this.emit('num');
        break;
      case ts.SyntaxKind.StringKeyword:
        this.emit('String');
        break;
      case ts.SyntaxKind.VoidKeyword:
        this.emit('void');
        break;
      case ts.SyntaxKind.BooleanKeyword:
        this.emit('bool');
        break;
      case ts.SyntaxKind.AnyKeyword:
        this.emit('dynamic');
        break;
      default:
        return false;
    }
    return true;
  }
}

export = TypeTranspiler;
