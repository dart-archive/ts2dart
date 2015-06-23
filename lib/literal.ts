/// <reference path='../node_modules/typescript/bin/typescript.d.ts' />
import ts = require('typescript');
import base = require('./base');
import ts2dart = require('./main');
import {FacadeConverter} from "./facade_converter";

class LiteralTranspiler extends base.TranspilerBase {
  constructor(tr: ts2dart.Transpiler, private fc: FacadeConverter) { super(tr); }

  visitNode(node: ts.Node): boolean {
    switch (node.kind) {
      // Literals.
      case ts.SyntaxKind.NumericLiteral:
        var sLit = <ts.LiteralExpression>node;
        this.emit(sLit.getText());
        break;
      case ts.SyntaxKind.StringLiteral:
        var sLit = <ts.LiteralExpression>node;
        var text = JSON.stringify(sLit.text);
        // Escape dollar sign since dart will interpolate in double quoted literal
        var text = text.replace(/\$/, '\\$');
        this.emit(text);
        break;
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        this.emit(`'''${this.escapeTextForTemplateString(node)}'''`);
        break;
      case ts.SyntaxKind.TemplateMiddle:
        this.emitNoSpace(this.escapeTextForTemplateString(node));
        break;
      case ts.SyntaxKind.TemplateExpression:
        var tmpl = <ts.TemplateExpression>node;
        if (tmpl.head) this.visit(tmpl.head);
        if (tmpl.templateSpans) this.visitEach(tmpl.templateSpans);
        break;
      case ts.SyntaxKind.TemplateHead:
        this.emit(`'''${this.escapeTextForTemplateString(node)}`); //highlighting bug:'
        break;
      case ts.SyntaxKind.TemplateTail:
        this.emitNoSpace(this.escapeTextForTemplateString(node));
        this.emitNoSpace(`'''`);
        break;
      case ts.SyntaxKind.TemplateSpan:
        var span = <ts.TemplateSpan>node;
        if (span.expression) {
          // Do not emit extra whitespace inside the string template
          this.emitNoSpace('${');
          this.visit(span.expression);
          this.emitNoSpace('}');
        }
        if (span.literal) this.visit(span.literal);
        break;
      case ts.SyntaxKind.ArrayLiteralExpression:
        if (this.shouldBeConst(node)) this.emit('const');
        this.emit('[');
        this.visitList((<ts.ArrayLiteralExpression>node).elements);
        this.emit(']');
        break;
      case ts.SyntaxKind.ObjectLiteralExpression:
        if (this.shouldBeConst(node)) this.emit('const');
        this.emit('{');
        this.visitList((<ts.ObjectLiteralExpression>node).properties);
        this.emit('}');
        break;
      case ts.SyntaxKind.PropertyAssignment:
        var propAssign = <ts.PropertyAssignment>node;
        if (propAssign.name.kind === ts.SyntaxKind.Identifier) {
          // Dart identifiers in Map literals need quoting.
          this.emitNoSpace(' "');
          this.emitNoSpace((<ts.Identifier>propAssign.name).text);
          this.emitNoSpace('"');
        } else {
          this.visit(propAssign.name);
        }
        this.emit(':');
        this.visit(propAssign.initializer);
        break;
      case ts.SyntaxKind.ShorthandPropertyAssignment:
        var shorthand = <ts.ShorthandPropertyAssignment>node;
        this.emitNoSpace(' "');
        this.emitNoSpace(shorthand.name.text);
        this.emitNoSpace('"');
        this.emit(':');
        this.visit(shorthand.name);
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
        this.emit('new RegExp (');
        this.emit('r\'');
        var regExp = (<ts.LiteralExpression>node).text;
        var slashIdx = regExp.lastIndexOf('/');
        var flags = regExp.substring(slashIdx + 1);
        regExp = regExp.substring(1, slashIdx);  // cut off /.../ chars.
        regExp = regExp.replace(/'/g, '\' + "\'" + r\'');  // handle nested quotes by concatenation.
        this.emitNoSpace(regExp);
        this.emitNoSpace('\'');
        if (flags.indexOf('g') === -1) {
          // Dart RegExps are always global, so JS regexps must use 'g' so that semantics match.
          this.reportError(node, 'Regular Expressions must use the //g flag');
        }
        if (flags.indexOf('m') !== -1) {
          this.emit(', multiline: true');
        }
        if (flags.indexOf('i') !== -1) {
          this.emit(', caseSensitive: false');
        }
        this.emit(')');
        break;
      case ts.SyntaxKind.ThisKeyword:
        this.emit('this');
        break;

      default:
        return false;
    }
    return true;
  }

  private shouldBeConst(n: ts.Node): boolean {
    return this.hasAncestor(n, ts.SyntaxKind.Decorator) || this.fc.isInsideConstExpr(n);
  }

  private escapeTextForTemplateString(n: ts.Node): string {
    return (<ts.StringLiteral>n).text.replace(/\\/g, '\\\\').replace(/([$'])/g, '\\$1');
  }
}

export = LiteralTranspiler;
