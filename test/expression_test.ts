/// <reference path="../typings/mocha/mocha.d.ts"/>
import {expectTranslate, expectErroneousCode} from './test_support';

function expectTranslates(cases: any) {
  for (var tsCode in cases) {
    expectTranslate(tsCode).to.equal(cases[tsCode]);
  }
}

// TODO(jacobr): we don't really need to be specifying separate code for the
// JS and Dart version for these tests as the code formatting is identical.
describe('expressions', () => {
  it('does math', () => {
    expectTranslates({
      '1 + 2': '1 + 2;',
      '1 - 2': '1 - 2;',
      '1 * 2': '1 * 2;',
      '1 / 2': '1 / 2;',
      '1 % 2': '1 % 2;',
      'x++': 'x++;',
      'x--': 'x--;',
      '++x': '++x;',
      '--x': '--x;',
      '-x': '-x;',
    });
  });
  it('assigns', () => {
    expectTranslates({
      'x += 1': 'x += 1;',
      'x -= 1': 'x -= 1;',
      'x *= 1': 'x *= 1;',
      'x /= 1': 'x /= 1;',
      'x %= 1': 'x %= 1;',
      'x <<= 1': 'x <<= 1;',
      'x >>= 1': 'x >>= 1;',
      //      'x >>>= 1': 'x >>>= 1;', // This doesn't appear to be a valid operator in Dart.
      'x &= 1': 'x &= 1;',
      'x ^= 1': 'x ^= 1;',
      'x |= 1': 'x |= 1;',
    });
  });
  it('compares', () => {
    expectTranslates({
      '1 == 2': '1 == 2;',
      '1 != 2': '1 != 2;',
      '1 > 2': '1 > 2;',
      '1 < 2': '1 < 2;',
      '1 >= 2': '1 >= 2;',
      '1 <= 2': '1 <= 2;',
    });
  });
  it('compares identity', () => {
    expectTranslate('1 === 2').to.equal('identical(1, 2);');
    expectTranslate('1 !== 2').to.equal('!identical(1, 2);');
  });
  it('bit fiddles', () => {
    expectTranslates({
      '1 & 2': '1 & 2;',
      '1 | 2': '1 | 2;',
      '1 ^ 2': '1 ^ 2;',
      '~1': '~1;',
      '1 << 2': '1 << 2;',
      '1 >> 2': '1 >> 2;',
      //      '1 >>> 2': '1 >>> 2;',  // This doesn't appear to be a valid operator in Dart.
    });
  });
  it('translates logic', () => {
    expectTranslates({
      '1 && 2': '1 && 2;',
      '1 || 2': '1 || 2;',
      '!1': '!1;',
    });
  });
  it('translates ternary',
     () => { expectTranslate('var x = 1 ? 2 : 3').to.equal('var x = 1 ? 2 : 3;'); });
  it('translates the comma operator',
     () => { expectTranslate('var x = [1, 2]').to.equal('var x = [1, 2];'); });
  it('translates "in"',
     () => { expectErroneousCode('x in y').to.throw('in operator is unsupported'); });
  it('translates "instanceof"',
     () => { expectTranslate('1 instanceof Foo').to.equal('1 is Foo;'); });
  it('translates "this"', () => { expectTranslate('this.x').to.equal('this.x;'); });
  it('translates "delete"',
     () => { expectErroneousCode('delete x[y];').to.throw('delete operator is unsupported'); });
  it('translates "typeof"',
     () => { expectErroneousCode('typeof x;').to.throw('typeof operator is unsupported'); });
  it('translates "void"',
     () => { expectErroneousCode('void x;').to.throw('void operator is unsupported'); });
  it('translates parens', () => { expectTranslate('(1)').to.equal('(1);'); });

  it('translates property paths', () => {
    expectTranslate('foo.bar;').to.equal('foo.bar;');
    expectTranslate('foo[bar];').to.equal('foo[bar];');
  });
});
