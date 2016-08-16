import * as ts from 'typescript';

import * as base from './base';
import {FacadeConverter} from './facade_converter';
import {Transpiler} from './main';

export default class TypeTranspiler extends base.TranspilerBase {
  constructor(tr: Transpiler, private fc: FacadeConverter) { super(tr); }

  visitNode(node: ts.Node): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.TypeLiteral:
        let indexType = this.maybeDestructureIndexType(<ts.TypeLiteralNode>node);
        if (indexType) {
          // This is effectively a Map.
          this.emit('Map <');
          this.visit(indexType[0]);
          this.emit(',');
          this.visit(indexType[1]);
          this.emit('>');
        } else {
          // Dart doesn't support other type literals.
          this.emit('dynamic');
        }
        break;
      case ts.SyntaxKind.UnionType:
        this.emit('dynamic /*');
        this.visitList((<ts.UnionTypeNode>node).types, '|');
        this.emit('*/');
        break;
      case ts.SyntaxKind.TypeReference:
        let typeRef = <ts.TypeReferenceNode>node;
        this.fc.visitTypeName(typeRef.typeName);
        this.maybeVisitTypeArguments(typeRef);
        break;
      case ts.SyntaxKind.TypeAssertionExpression:
        let typeAssertExpr = <ts.TypeAssertion>node;
        if (this.isReifiedTypeLiteral(typeAssertExpr)) {
          this.visit(typeAssertExpr.expression);
          break;  // type is handled by the container literal itself.
        }
        this.emit('(');
        this.visit(typeAssertExpr.expression);
        this.emit('as');
        this.visit(typeAssertExpr.type);
        this.emit(')');
        break;
      case ts.SyntaxKind.TypeParameter:
        let typeParam = <ts.TypeParameterDeclaration>node;
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
        let first = <ts.QualifiedName>node;
        this.visit(first.left);
        this.emit('.');
        this.visit(first.right);
        break;
      case ts.SyntaxKind.Identifier:
        let ident = <ts.Identifier>node;
        this.fc.visitTypeName(ident);
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

  isReifiedTypeLiteral(node: ts.TypeAssertion): boolean {
    if (node.expression.kind === ts.SyntaxKind.ArrayLiteralExpression &&
        node.type.kind === ts.SyntaxKind.ArrayType) {
      return true;
    } else if (
        node.expression.kind === ts.SyntaxKind.ObjectLiteralExpression &&
        node.type.kind === ts.SyntaxKind.TypeLiteral) {
      return true;
    }
    return false;
  }
}
