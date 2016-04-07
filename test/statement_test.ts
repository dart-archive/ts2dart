/// <reference path="../typings/mocha/mocha.d.ts"/>
import {expectTranslate} from './test_support';

describe('statements', () => {
  it('translates switch', () => {
    expectTranslate('switch(x) { case 1: break; case 2: break; default: break; }')
        .to.equal(`switch (x) {
  case 1:
    break;
  case 2:
    break;
  default:
    break;
}`);
  });
  it('translates for loops', () => {
    expectTranslate('for (1; 2; 3) { 4 }').to.equal(`for (1; 2; 3) {
  4;
}`);
    expectTranslate('for (var x = 1; 2; 3) { 4 }').to.equal(`for (var x = 1; 2; 3) {
  4;
}`);
    expectTranslate('for (var x, y = 1; 2; 3) { 4 }').to.equal(`for (var x, y = 1; 2; 3) {
  4;
}`);
    expectTranslate('for (var x = 0, y = 1; 2; 3) { 4 }').to.equal(`for (var x = 0, y = 1; 2; 3) {
  4;
}`);
  });
  it('translates for-in loops', () => {
    expectTranslate('for (var x in 1) { 2 }').to.equal(`for (var x in 1) {
  2;
}`);
    expectTranslate('for (x in 1) { 2 }').to.equal(`for (x in 1) {
  2;
}`);
  });
  it('translates for-of loops', () => {
    expectTranslate('for (var x of 1) { 2 }').to.equal(`for (var x in 1) {
  2;
}`);
    expectTranslate('for (x of 1) { 2 }').to.equal(`for (x in 1) {
  2;
}`);
  });
  it('translates while loops', () => {
    expectTranslate('while (1) { 2 }').to.equal(`while (1) {
  2;
}`);
    expectTranslate('do 1; while (2);').to.equal('do 1; while (2);');
  });
  it('translates if/then/else', () => {
    expectTranslate('if (x) { 1 }').to.equal(`if (x) {
  1;
}`);
    expectTranslate('if (x) { 1 } else { 2 }').to.equal(`if (x) {
  1;
} else {
  2;
}`);
    expectTranslate('if (x) 1;').to.equal('if (x) 1;');
    expectTranslate('if (x) 1; else 2;').to.equal(`if (x)
  1;
else
  2;`);
  });
  it('translates try/catch', () => {
    expectTranslate('try {} catch(e) {} finally {}')
        .to.equal('try {} catch (e, e_stack) {} finally {}');
    expectTranslate('try {} catch(e: MyException) {}')
        .to.equal('try {} on MyException catch (e, e_stack) {}');
  });
  it('translates throw',
     () => { expectTranslate('throw new Error("oops")').to.equal('throw new Error("oops");'); });
  it('translates empty statements', () => { expectTranslate(';').to.equal(';'); });
  it('translates break & continue', () => {
    expectTranslate(`while (true) {
   break;
}`).to.equal(`while (true) {
  break;
}`);
    expectTranslate(`while (true) {
   continue;
}`).to.equal(`while (true) {
  continue;
}`);
    expectTranslate(`while (true) {
   break foo;
}`).to.equal(`while (true) {
  break foo;
}`);
  });
  it('rewrites catch block to preserve stack trace', () => {
    expectTranslate(`try {} catch (e) {
  console.log(e, e.stack);
}`).to.equal(`try {} catch (e, e_stack) {
  console.log(e, e_stack);
}`);
  });
  it('rewrites rethrow to preserve stack trace', () => {
    expectTranslate('try {} catch (ex) { throw ex; }').to.equal(`try {} catch (ex, ex_stack) {
  rethrow;
}`);
  });
});
