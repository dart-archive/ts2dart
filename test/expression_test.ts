/// <reference path="../typings/mocha/mocha.d.ts"/>
import t = require('./test_support');

function expectTranslates(cases: any) {
  for (var tsCode in cases) {
    t.expectTranslate(tsCode).to.equal(cases[tsCode]);
  }
}

describe('expressions', () => {
  it('does math', () => {
    expectTranslates({
      '1 + 2': ' 1 + 2 ;',
      '1 - 2': ' 1 - 2 ;',
      '1 * 2': ' 1 * 2 ;',
      '1 / 2': ' 1 / 2 ;',
      '1 % 2': ' 1 % 2 ;',
      'x++': ' x ++ ;',
      'x--': ' x -- ;',
      '++x': ' ++ x ;',
      '--x': ' -- x ;',
      '-x': ' - x ;',
    });
  });
  it('assigns', () => {
    expectTranslates({
      'x += 1': ' x += 1 ;',
      'x -= 1': ' x -= 1 ;',
      'x *= 1': ' x *= 1 ;',
      'x /= 1': ' x /= 1 ;',
      'x %= 1': ' x %= 1 ;',
      'x <<= 1': ' x <<= 1 ;',
      'x >>= 1': ' x >>= 1 ;',
      'x >>>= 1': ' x >>>= 1 ;',
      'x &= 1': ' x &= 1 ;',
      'x ^= 1': ' x ^= 1 ;',
      'x |= 1': ' x |= 1 ;',
    });
  });
  it('compares', () => {
    expectTranslates({
      '1 == 2': ' 1 == 2 ;',
      '1 != 2': ' 1 != 2 ;',
      '1 > 2': ' 1 > 2 ;',
      '1 < 2': ' 1 < 2 ;',
      '1 >= 2': ' 1 >= 2 ;',
      '1 <= 2': ' 1 <= 2 ;',
    });
  });
  it('compares identity', () => {
    t.expectTranslate('1 === 2').to.equal(' identical ( 1 , 2 ) ;');
    t.expectTranslate('1 !== 2').to.equal(' ! identical ( 1 , 2 ) ;');
  });
  it('bit fiddles', () => {
    expectTranslates({
      '1 & 2': ' 1 & 2 ;',
      '1 | 2': ' 1 | 2 ;',
      '1 ^ 2': ' 1 ^ 2 ;',
      '~ 1': ' ~ 1 ;',
      '1 << 2': ' 1 << 2 ;',
      '1 >> 2': ' 1 >> 2 ;',
      '1 >>> 2': ' 1 >>> 2 ;',
    });
  });
  it('translates logic', () => {
    expectTranslates({
      '1 && 2': ' 1 && 2 ;',
      '1 || 2': ' 1 || 2 ;',
      '!1': ' ! 1 ;',
    });
  });
  it('translates ternary', () => { t.expectTranslate('1 ? 2 : 3').to.equal(' 1 ? 2 : 3 ;'); });
  it('translates the comma operator', () => { t.expectTranslate('1 , 2').to.equal(' 1 , 2 ;'); });
  it('translates "in"', () => { t.expectTranslate('1 in 2').to.equal(' 1 in 2 ;'); });
  it('translates "instanceof"',
     () => { t.expectTranslate('1 instanceof 2').to.equal(' 1 is 2 ;'); });
  it('translates "this"', () => { t.expectTranslate('this.x').to.equal(' this . x ;'); });
  it('translates "delete"',
     () => { t.expectErroneousCode('delete x[y];').to.throw('delete operator is unsupported'); });
  it('translates "typeof"',
     () => { t.expectErroneousCode('typeof x;').to.throw('typeof operator is unsupported'); });
  it('translates "void"',
     () => { t.expectErroneousCode('void x;').to.throw('void operator is unsupported'); });
  it('translates parens', () => { t.expectTranslate('(1)').to.equal(' ( 1 ) ;'); });

  it('translates property paths', () => {
    t.expectTranslate('foo.bar;').to.equal(' foo . bar ;');
    t.expectTranslate('foo[bar];').to.equal(' foo [ bar ] ;');
  });
});
