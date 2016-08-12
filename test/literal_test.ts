/// <reference path="../typings/mocha/mocha.d.ts"/>
import {expectErroneousCode, expectTranslate} from './test_support';

describe('literals', () => {
  it('translates string literals', () => {
    expectTranslate(`'hello\\' "world'`).to.equal(`"hello' \\"world";`);
    expectTranslate(`"hello\\" 'world"`).to.equal(`"hello\\" 'world";`);
  });

  it('translates string templates', () => {
    expectTranslate('`hello \nworld`').to.equal(`'''hello \nworld''';`);
    expectTranslate('`hello ${world}`').to.equal(`'''hello \${ world}''';`);
    expectTranslate('`${a}$b${$c}`').to.equal(`'''\${ a}\\$b\${ $c}''';`);
    expectTranslate('`\'${a}\'`').to.equal(`'''\\\'\${ a}\\\'''';`);
    expectTranslate('`\'a\'`').to.equal(`'''\\\'a\\\'''';`);
    // https://github.com/angular/angular/issues/509
    expectTranslate('"${a}"').to.equal('"\\${a}";');
    expectTranslate('"\\${a}"').to.equal('"\\${a}";');
    expectTranslate('\'\\${a}\'').to.equal('"\\${a}";');
    expectTranslate('\'$a\'').to.equal(`"\\$a";`);
    expectTranslate('`$a`').to.equal(`'''\\$a''';`);
    expectTranslate('`\\$a`').to.equal(`'''\\$a''';`);
  });

  it('escapes escape sequences',
     () => { expectTranslate('`\\\\u1234`').to.equal(`'''\\\\u1234''';`); });

  it('translates boolean literals', () => {
    expectTranslate('true').to.equal('true;');
    expectTranslate('false').to.equal('false;');
    expectTranslate('var b:boolean = true;').to.equal('bool b = true;');
  });

  it('translates the null literal', () => { expectTranslate('null').to.equal('null;'); });

  it('translates number literals', () => {
    // Negative numbers are handled by unary minus expressions.
    expectTranslate('1234').to.equal('1234;');
    expectTranslate('12.34').to.equal('12.34;');
    expectTranslate('1.23e-4').to.equal('1.23e-4;');
  });

  it('translates regexp literals', () => {
    expectTranslate('/wo\\/t?/g').to.equal('new RegExp(r\'wo\\/t?\');');
    expectTranslate('/\'/g').to.equal('new RegExp(r\'\' + "\'" + r\'\');');
    expectTranslate('/\'o\'/g').to.equal('new RegExp(r\'\' + "\'" + r\'o\' + "\'" + r\'\');');
    expectTranslate('/abc/gmi')
        .to.equal('new RegExp(r\'abc\', multiLine: true, caseSensitive: false);');
    expectErroneousCode('/abc/').to.throw(/Regular Expressions must use the \/\/g flag/);
  });

  it('translates array literals', () => {
    expectTranslate('[1,2]').to.equal('[1, 2];');
    expectTranslate('[1,]').to.equal('[1];');
    expectTranslate('[]').to.equal('[];');
  });

  it('translates object literals', () => {
    expectTranslate('var x = {a: 1, b: 2}').to.equal('var x = {"a": 1, "b": 2};');
    expectTranslate('var x = {a: 1, }').to.equal('var x = {"a": 1};');
    expectTranslate('var x = {}').to.equal('var x = {};');
    expectTranslate('var x = {y}').to.equal('var x = {"y": y};');
  });
});
