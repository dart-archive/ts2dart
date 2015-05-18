/// <reference path='../node_modules/typescript/bin/typescript.d.ts' />
import ts = require('typescript');
import base = require('./base');
import ts2dart = require('./main');
import {FacadeConverter} from './facade_converter';

class ExpressionTranspiler extends base.TranspilerBase {
  constructor(tr: ts2dart.Transpiler, private fc: FacadeConverter) { super(tr); }

  visitNode(node: ts.Node): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.BinaryExpression:
        var binExpr = <ts.BinaryExpression>node;
        var operatorKind = binExpr.operatorToken.kind;
        if (operatorKind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
            operatorKind === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
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
            this.visitTypeName(<ts.Identifier>binExpr.right);
          } else {
            this.emit(ts.tokenToString(binExpr.operatorToken.kind));
            this.visit(binExpr.right);
          }
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

      case ts.SyntaxKind.ParenthesizedExpression:
        var parenExpr = <ts.ParenthesizedExpression>node;
        this.emit('(');
        this.visit(parenExpr.expression);
        this.emit(')');
        break;

      case ts.SyntaxKind.PropertyAccessExpression:
        var propAccess = <ts.PropertyAccessExpression>node;
        this.visit(propAccess.expression);
        if (propAccess.name.text === 'stack' &&
            this.hasAncestor(propAccess, ts.SyntaxKind.CatchClause)) {
          this.emitNoSpace('_stack');
        } else {
          this.fc.checkPropertyAccess(propAccess);
          this.emit('.');
          this.visit(propAccess.name);
        }
        break;
      case ts.SyntaxKind.ElementAccessExpression:
        var elemAccess = <ts.ElementAccessExpression>node;
        this.visit(elemAccess.expression);
        this.emit('[');
        this.visit(elemAccess.argumentExpression);
        this.emit(']');
        break;

      default:
        return false;
    }
    return true;
  }
}

export = ExpressionTranspiler;
