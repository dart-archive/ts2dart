import * as ts from 'typescript';

import * as base from './base';
import {FacadeConverter} from './facade_converter';
import {Transpiler} from './main';

export default class ExpressionTranspiler extends base.TranspilerBase {
  constructor(tr: Transpiler, private fc: FacadeConverter) { super(tr); }

  visitNode(node: ts.Node): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.BinaryExpression:
        let binExpr = <ts.BinaryExpression>node;
        let operatorKind = binExpr.operatorToken.kind;
        let tokenStr = ts.tokenToString(operatorKind);
        switch (operatorKind) {
          case ts.SyntaxKind.EqualsEqualsEqualsToken:
          case ts.SyntaxKind.ExclamationEqualsEqualsToken:
            if (operatorKind === ts.SyntaxKind.ExclamationEqualsEqualsToken) this.emit('!');
            this.emit('identical (');
            this.visit(binExpr.left);
            this.emit(',');
            this.visit(binExpr.right);
            this.emit(')');
            break;
          case ts.SyntaxKind.CaretToken:
          case ts.SyntaxKind.BarToken:
          case ts.SyntaxKind.AmpersandToken:
          case ts.SyntaxKind.GreaterThanGreaterThanToken:
          case ts.SyntaxKind.LessThanLessThanToken:
          case ts.SyntaxKind.CaretEqualsToken:
          case ts.SyntaxKind.BarEqualsToken:
          case ts.SyntaxKind.AmpersandEqualsToken:
          case ts.SyntaxKind.GreaterThanGreaterThanEqualsToken:
          case ts.SyntaxKind.LessThanLessThanEqualsToken:
            // In Dart, the bitwise operators are only available on int, so the number types ts2dart
            // deals with have to be converted to int explicitly to match JS's semantics in Dart.
            if (tokenStr[tokenStr.length - 1] === '=') {
              // For assignments, strip the trailing `=` sign to emit just the operator itself.
              this.visit(binExpr.left);
              this.emit('=');
              this.visitAndWrapAsInt(binExpr.left);
              this.emit(tokenStr.slice(0, -1));
            } else {
              // normal case (LHS [op])
              this.visitAndWrapAsInt(binExpr.left);
              this.emit(tokenStr);
            }
            this.visitAndWrapAsInt(binExpr.right);
            break;
          case ts.SyntaxKind.InKeyword:
            this.reportError(node, 'in operator is unsupported');
            break;
          case ts.SyntaxKind.InstanceOfKeyword:
            this.visit(binExpr.left);
            this.emit('is');
            this.fc.visitTypeName(<ts.Identifier>binExpr.right);
            break;
          default:
            this.visit(binExpr.left);
            this.emit(tokenStr);
            this.visit(binExpr.right);
            break;
        }
        break;
      case ts.SyntaxKind.PrefixUnaryExpression:
        let prefixUnary = <ts.PrefixUnaryExpression>node;
        let operator = ts.tokenToString(prefixUnary.operator);
        this.emit(operator);

        if (prefixUnary.operator === ts.SyntaxKind.TildeToken) {
          this.visitAndWrapAsInt(prefixUnary.operand);
        } else {
          this.visit(prefixUnary.operand);
        }
        break;
      case ts.SyntaxKind.PostfixUnaryExpression:
        let postfixUnary = <ts.PostfixUnaryExpression>node;
        this.visit(postfixUnary.operand);
        this.emit(ts.tokenToString(postfixUnary.operator));
        break;
      case ts.SyntaxKind.ConditionalExpression:
        let conditional = <ts.ConditionalExpression>node;
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
        let parenExpr = <ts.ParenthesizedExpression>node;
        this.emit('(');
        this.visit(parenExpr.expression);
        this.emit(')');
        break;

      case ts.SyntaxKind.PropertyAccessExpression:
        let propAccess = <ts.PropertyAccessExpression>node;
        if (propAccess.name.text === 'stack' &&
            this.hasAncestor(propAccess, ts.SyntaxKind.CatchClause)) {
          // Handle `e.stack` accesses in catch clauses by mangling to `e_stack`.
          // FIXME: Use type checker/FacadeConverter to make sure this is actually Error.stack.
          this.visit(propAccess.expression);
          this.emitNoSpace('_stack');
        } else {
          if (this.fc.handlePropertyAccess(propAccess)) break;
          this.visit(propAccess.expression);
          this.emit('.');
          this.visit(propAccess.name);
        }
        break;
      case ts.SyntaxKind.ElementAccessExpression:
        let elemAccess = <ts.ElementAccessExpression>node;
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

  visitAndWrapAsInt(n: ts.Expression) {
    let lhsIsHexLit = n.kind === ts.SyntaxKind.NumericLiteral;
    if (lhsIsHexLit) {
      this.visit(n);
      return;
    }
    this.emit('(');
    this.visit(n);
    this.emit('as int)');
  }
}
