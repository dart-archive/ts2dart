/// <reference path="../typings/mocha/mocha.d.ts"/>
import {expectTranslate, expectErroneousCode} from './test_support';

function expectTranslates(cases: any) {
  for (var tsCode in cases) {
    expectTranslate(tsCode).to.equal(cases[tsCode]);
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
    expectTranslate('1 === 2').to.equal(' identical ( 1 , 2 ) ;');
    expectTranslate('1 !== 2').to.equal(' ! identical ( 1 , 2 ) ;');
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
  it('translates ternary', () => { expectTranslate('1 ? 2 : 3').to.equal(' 1 ? 2 : 3 ;'); });
  it('translates the comma operator', () => { expectTranslate('1 , 2').to.equal(' 1 , 2 ;'); });
  it('translates "in"', () => { expectTranslate('1 in 2').to.equal(' 1 in 2 ;'); });
  it('translates "instanceof"', () => { expectTranslate('1 instanceof 2').to.equal(' 1 is 2 ;'); });
  it('translates "this"', () => { expectTranslate('this.x').to.equal(' this . x ;'); });
  it('translates "delete"',
     () => { expectErroneousCode('delete x[y];').to.throw('delete operator is unsupported'); });
  it('translates "typeof"',
     () => { expectErroneousCode('typeof x;').to.throw('typeof operator is unsupported'); });
  it('translates "void"',
     () => { expectErroneousCode('void x;').to.throw('void operator is unsupported'); });
  it('translates parens', () => { expectTranslate('(1)').to.equal(' ( 1 ) ;'); });

  it('translates property paths', () => {
    expectTranslate('foo.bar;').to.equal(' foo . bar ;');
    expectTranslate('foo[bar];').to.equal(' foo [ bar ] ;');
  });
});
