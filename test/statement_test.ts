/// <reference path="../typings/mocha/mocha.d.ts"/>
import t = require('./test_support');

describe('statements', () => {
  it('translates switch', () => {
    t.expectTranslate('switch(x) { case 1: break; case 2: break; default: break; }')
        .to.equal(' switch ( x ) { case 1 : break ; case 2 : break ; default : break ; }');
  });
  it('translates for loops', () => {
    t.expectTranslate('for (1; 2; 3) { 4 }').to.equal(' for ( 1 ; 2 ; 3 ) { 4 ; }');
    t.expectTranslate('for (var x = 1; 2; 3) { 4 }').to.equal(' for ( var x = 1 ; 2 ; 3 ) { 4 ; }');
    t.expectTranslate('for (var x, y = 1; 2; 3) { 4 }')
        .to.equal(' for ( var x , y = 1 ; 2 ; 3 ) { 4 ; }');
    t.expectTranslate('for (var x = 0, y = 1; 2; 3) { 4 }')
        .to.equal(' for ( var x = 0 , y = 1 ; 2 ; 3 ) { 4 ; }');
  });
  it('translates for-in loops', () => {
    t.expectTranslate('for (var x in 1) { 2 }').to.equal(' for ( var x in 1 ) { 2 ; }');
    t.expectTranslate('for (x in 1) { 2 }').to.equal(' for ( x in 1 ) { 2 ; }');
  });
  it('translates while loops', () => {
    t.expectTranslate('while (1) { 2 }').to.equal(' while ( 1 ) { 2 ; }');
    t.expectTranslate('do 1; while (2);').to.equal(' do 1 ; while ( 2 ) ;');
  });
  it('translates if/then/else', () => {
    t.expectTranslate('if (x) { 1 }').to.equal(' if ( x ) { 1 ; }');
    t.expectTranslate('if (x) { 1 } else { 2 }').to.equal(' if ( x ) { 1 ; } else { 2 ; }');
    t.expectTranslate('if (x) 1;').to.equal(' if ( x ) 1 ;');
    t.expectTranslate('if (x) 1; else 2;').to.equal(' if ( x ) 1 ; else 2 ;');
  });
  it('translates try/catch', () => {
    t.expectTranslate('try {} catch(e) {} finally {}')
        .to.equal(' try { } catch ( e ) { } finally { }');
    t.expectTranslate('try {} catch(e: MyException) {}')
        .to.equal(' try { } on MyException catch ( e ) { }');
  });
  it('translates throw', () => {
    t.expectTranslate('throw new Error("oops")').to.equal(' throw new Error ( "oops" ) ;');
  });
  it('translates empty statements', () => { t.expectTranslate(';').to.equal(' ;'); });
  it('translates break & continue', () => {
    t.expectTranslate('break;').to.equal(' break ;');
    t.expectTranslate('continue;').to.equal(' continue ;');
    t.expectTranslate('break foo ;').to.equal(' break foo ;');
  });
});
