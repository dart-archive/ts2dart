import * as ts from 'typescript';
import * as base from './base';
import {Transpiler} from './main';
import {FacadeConverter} from './facade_converter';

function visitAndWrapAsInt(visitor: ExpressionTranspiler, ident: ts.Node) {
  visitor.emit('(');
  visitor.visit(ident);
  visitor.emit('as int)');
}

export default class ExpressionTranspiler extends base.TranspilerBase {
  constructor(tr: Transpiler, private fc: FacadeConverter) { super(tr); }

  visitNode(node: ts.Node): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.BinaryExpression:
        var binExpr = <ts.BinaryExpression>node;
        var operatorKind = binExpr.operatorToken.kind;
        var tokenStr = ts.tokenToString(operatorKind);
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
            // the bitwise operators are only available on int,
            // so the number types ts2dart deals with have to
            // be converted to int explicitly to match
            // JavaScript's semantics in Dart

            if (tokenStr[tokenStr.length - 1] == "=") {
              // For assignments, strip the trailing `=` sign so that
              // the operator before it can be extracted

              this.visit(binExpr.left);
              this.emit('=');
              visitAndWrapAsInt(this, binExpr.left);
              this.emit(tokenStr.slice(0, -1));
            } else {
              // normal case (LHS [op])
              visitAndWrapAsInt(this, binExpr.left);
              this.emit(tokenStr);
            }
            visitAndWrapAsInt(this, binExpr.right);
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
        var prefixUnary = <ts.PrefixUnaryExpression>node;
        var operator = ts.tokenToString(prefixUnary.operator);
        this.emit(operator);

        if (prefixUnary.operator === ts.SyntaxKind.TildeToken) {
          visitAndWrapAsInt(this, prefixUnary.operand);
        } else {
          this.visit(prefixUnary.operand);
        }
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
