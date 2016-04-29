/// <reference path="./test.d.ts"/>
import t = require('test/test');
import {MyClass, MySubclass, SOME_ARRAY} from './lib';

function callOne<T, U>(a: (t: T) => U, t: T): U {
  return a(t);
}

/* tslint:disable: no-unused-variable */
function main(): void {
  /* tslint:enable: no-unused-variable */
  t.test('handles classes', function() {
    let mc = new MyClass('hello');
    t.expect(mc.field.toUpperCase(), t.equals('HELLO WORLD'));
    t.expect(mc.namedParam({x: '!'}), t.equals('hello!'));
    t.expect(mc.namedParam(), t.equals('hello?'));
  });
  t.test('allows subclassing and casts', function() {
    let mc: MyClass;
    mc = new MySubclass('hello');
    t.expect((<MySubclass>mc).subclassField, t.equals('hello world'));
  });
  t.test('string templates', function() {
    t.expect('$mc', t.equals('$mc'));
    let a = 'hello';
    let b = 'world';
    t.expect(`${a} ${b}`, t.equals('hello world'));
  });
  t.test('regexp', function() {
    t.expect(/o\./g.test('fo.o'), t.equals(true));
    t.expect(/o/g.exec('fo.o').length, t.equals(1));
    t.expect(/a(b)/g.exec('ab').length, t.equals(2));
  });
  t.test('const expr', function() { t.expect(SOME_ARRAY[0], t.equals(1)); });
  t.test('generic types fn', function() { t.expect(callOne((a) => a, 1), t.equals(1)); });

  t.test('promises', function() {
    let p: Promise<number> = new Promise<number>((resolve) => { resolve(1); });
    p.then((n) => { t.expect(n, t.equals(1)); });
  });
}
