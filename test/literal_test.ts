/// <reference path="../typings/mocha/mocha.d.ts"/>
import t = require('./test_support');

describe('literals', () => {
  it('translates string literals', () => {
    t.expectTranslate(`'hello\\' "world'`).to.equal(` "hello' \\"world" ;`);
      t.expectTranslate(`"hello\\" 'world"`).to.equal(` "hello\\" 'world" ;`);
  });

  it('translates string templates', () => {
    t.expectTranslate("`hello \nworld`").to.equal(" '''hello \nworld''' ;");
    t.expectTranslate("`hello ${world}`").to.equal(" '''hello ${ world}''' ;");
    t.expectTranslate("`${a}$b${$c}`").to.equal(" '''${ a}\\$b${ $c}''' ;");
    t.expectTranslate("`'${a}'`").to.equal(" '''\\'${ a}\\'''' ;");
    t.expectTranslate("`'a'`").to.equal(" '''\\'a\\'''' ;");
    // https://github.com/angular/angular/issues/509
    t.expectTranslate('"${a}"').to.equal(' "\\${a}" ;');
    t.expectTranslate('"\\${a}"').to.equal(' "\\${a}" ;');
    t.expectTranslate("'\\${a}'").to.equal(' "\\${a}" ;');
    t.expectTranslate("'$a'").to.equal(' "\\$a" ;');
    t.expectTranslate("`$a`").to.equal(" '''\\$a''' ;");
    t.expectTranslate("`\\$a`").to.equal(" '''\\$a''' ;");
  });

  it('escapes escape sequences',
     () => { t.expectTranslate("`\\\\u1234`").to.equal(" '''\\\\u1234''' ;"); });

  it('translates boolean literals', () => {
    t.expectTranslate('true').to.equal(' true ;');
    t.expectTranslate('false').to.equal(' false ;');
    t.expectTranslate('var b:boolean = true;').to.equal(' bool b = true ;');
  });

  it('translates the null literal', () => { t.expectTranslate('null').to.equal(' null ;'); });

  it('translates number literals', () => {
    // Negative numbers are handled by unary minus expressions.
    t.expectTranslate('1234').to.equal(' 1234 ;');
    t.expectTranslate('12.34').to.equal(' 12.34 ;');
    t.expectTranslate('1.23e-4').to.equal(' 1.23e-4 ;');
  });

  it('translates regexp literals',
     () => { t.expectTranslate('/wo\\/t?/').to.equal(' /wo\\/t?/ ;'); });

  it('translates array literals', () => {
    t.expectTranslate('[1,2]').to.equal(' [ 1 , 2 ] ;');
    t.expectTranslate('[1,]').to.equal(' [ 1 ] ;');
    t.expectTranslate('[]').to.equal(' [ ] ;');
  });

  it('translates object literals', () => {
    t.expectTranslate('var x = {a: 1, b: 2}').to.equal(' var x = { "a" : 1 , "b" : 2 } ;');
    t.expectTranslate('var x = {a: 1, }').to.equal(' var x = { "a" : 1 } ;');
    t.expectTranslate('var x = {}').to.equal(' var x = { } ;');
    t.expectTranslate('var x = {y}').to.equal(' var x = { "y" : y } ;');
  });
});
