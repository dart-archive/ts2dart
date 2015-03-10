/// <reference path="../typings/chai/chai.d.ts"/>
/// <reference path="../typings/source-map-support/source-map-support.d.ts"/>

import sms = require('source-map-support');
sms.install();

import chai = require('chai');
import main = require('../main');
import ts = require('typescript');

describe('transpile to dart', function() {

  function expectTranslate(tsCode: string) {
    var result = translateSource(tsCode);
    return chai.expect(result);
  }

  function expectTranslates(cases: any) {
    for (var tsCode in cases) {
      expectTranslate(tsCode).to.equal(cases[tsCode]);
    }
  }

  describe('variables', function() {
    it('should print variable declaration with initializer', function() {
      expectTranslate('var a:number = 1;').to.equal(' num a = 1 ;\n');
    });
    it('should print variable declaration', function () {
      expectTranslate('var a:number;').to.equal(' num a ;\n');
    });
  });

  describe('classes', function() {
    it('should translate classes', function() {
      expectTranslate('class X {}').to.equal(' class X {\n }\n');
    });
    it('should support extends', function() {
      expectTranslate('class X extends Y {}').to.equal(' class X extends Y {\n }\n');
    });
    it('should support implements', function() {
      expectTranslate('class X implements Y, Z {}').to.equal(' class X implements Y , Z {\n }\n');
    });
    it('should support implements', function() {
      expectTranslate('class X extends Y implements Z {}')
          .to.equal(' class X extends Y implements Z {\n }\n');
    });

    describe('members', function() {
      it('supports fields', function() {
        expectTranslate('class X { x: number; }').to.equal(' class X {\n num x ; }\n');
      });
      it('supports field initializers', function() {
        expectTranslate('class X { x: number = 42; }').to.equal(' class X {\n num x = 42 ; }\n');
      });
      it('supports methods', function() {
        expectTranslate('class X { x() { return 42; } }')
            .to.equal(' class X {\n x ( ) { return 42 ; } }\n');
      });
      it('supports method return types', function() {
        expectTranslate('class X { x(): number { return 42; } }')
            .to.equal(' class X {\n num x ( ) { return 42 ; } }\n');
      });
      it('supports method params', function() {
        expectTranslate('class X { x(a, b) { return 42; } }')
            .to.equal(' class X {\n x ( a , b ) { return 42 ; } }\n');
      });
      it('supports method return types', function() {
        expectTranslate('class X { x( a : number, b : string ) { return 42; } }')
            .to.equal(' class X {\n x ( num a , String b ) { return 42 ; } }\n');
      });

      it('supports constructors', function() {
        expectTranslate('class X { constructor() { } }')
            .to.equal(' class X {\n X ( ) { } }\n');
      });
    });
  });

  describe('functions', function() {
    it('supports declarations', function() {
      expectTranslate('function x() {}')
          .to.equal(' x ( ) { }');
    });
    it('supports param default values', function() {
      expectTranslate('function x(a = 42) { return 42; }')
          .to.equal(' x ( [ a = 42 ] ) { return 42 ; }');
    });
    it('does not support var args', function() {
      chai.expect(() => translateSource('function x(...a: number) { return 42; }'))
          .to.throw('rest parameters are unsupported');
    });
    it('translates calls', function() {
      expectTranslate('foo();').to.equal(' foo ( ) ;');
      expectTranslate('foo(1, 2);').to.equal(' foo ( 1 , 2 ) ;');
    });
    it('translates new calls', function() {
      expectTranslate('new Foo();').to.equal(' new Foo ( ) ;');
      expectTranslate('new Foo(1, 2);').to.equal(' new Foo ( 1 , 2 ) ;');
    });
  });

  describe('literals', function() {
    it('translates string literals', function() {
      expectTranslate(`'hello\\\\' "world'`).to.equal(` "hello' \\\\"world" ;`);
      expectTranslate(`"hello\\\\" 'world"`).to.equal(` "hello\\\\" 'world" ;`);
    });

    it('translates boolean literals', function() {
      expectTranslate('true').to.equal(' true ;');
      expectTranslate('false').to.equal(' false ;');
    });

    it('translates the null literal', function() {
      expectTranslate('null').to.equal(' null ;');
    });

    it('translates number literals', function() {
      // Negative numbers are handled by unary minus expressions.
      expectTranslate('1234').to.equal(' 1234 ;');
      expectTranslate('12.34').to.equal(' 12.34 ;');
      expectTranslate('1.23e-4').to.equal(' 1.23e-4 ;');
    });

    it('translates regexp literals', function() {
      expectTranslate('/wo\\/t?/').to.equal(' /wo\\/t?/ ;');
    });
  });

  describe('control structures', function() {
    it('translates switch', function() {
      expectTranslate('switch(x) { case 1: break; case 2: break; default: break; }')
          .to.equal(' switch ( x ) { case 1 : break ; case 2 : break ; default : break ; }');
    });
    it('translates for loops', function() {
      expectTranslate('for (1; 2; 3) { 4 }').to.equal(' for ( 1 ; 2 ; 3 ) { 4 ; }');
      expectTranslate('for (var x = 1; 2; 3) { 4 }').to.equal(' for ( var x = 1 ; 2 ; 3 ) { 4 ; }');
    });
    it('translates for-in loops', function() {
      expectTranslate('for (var x in 1) { 2 }').to.equal(' for ( var x in 1 ) { 2 ; }');
      expectTranslate('for (x in 1) { 2 }').to.equal(' for ( x in 1 ) { 2 ; }');
    });
    it('translates if/then/else', function() {
      expectTranslate('if (x) { 1 }').to.equal(' if ( x ) { 1 ; }');
      expectTranslate('if (x) { 1 } else { 2 }').to.equal(' if ( x ) { 1 ; } else { 2 ; }');
      expectTranslate('if (x) 1;').to.equal(' if ( x ) 1 ;');
      expectTranslate('if (x) 1; else 2;').to.equal(' if ( x ) 1 ; else 2 ;');
    });
  });

  describe('property expressions', function() {
    it('translates property paths', function() {
      expectTranslate('foo.bar;').to.equal(' foo . bar ;');
      expectTranslate('foo[bar];').to.equal(' foo [ bar ] ;');
    });
  });

  describe('basic expressions', function() {
    it('does math', function() {
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
    it('assigns', function() {
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
    it('compares', function() {
      expectTranslates({
        '1 == 2': ' 1 == 2 ;',
        '1 === 2': ' 1 === 2 ;',
        '1 != 2': ' 1 != 2 ;',
        '1 !== 2': ' 1 !== 2 ;',
        '1 > 2': ' 1 > 2 ;',
        '1 < 2': ' 1 < 2 ;',
        '1 >= 2': ' 1 >= 2 ;',
        '1 <= 2': ' 1 <= 2 ;',
      });
    });
    it('bit fiddles', function() {
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
    it('translates logic', function() {
      expectTranslates({
        '1 && 2': ' 1 && 2 ;',
        '1 || 2': ' 1 || 2 ;',
        '!1': ' ! 1 ;',
      });
    });
    it('translates ternary', function() {
      expectTranslate('1 ? 2 : 3').to.equal(' 1 ? 2 : 3 ;');
    });
    it('translates the comma operator', function() {
      expectTranslate('1 , 2').to.equal(' 1 , 2 ;');
    });
    it('translates "in"', function() {
      expectTranslate('1 in 2').to.equal(' 1 in 2 ;');
    });
    it('translates "instanceof"', function() {
      expectTranslate('1 instanceof 2').to.equal(' 1 instanceof 2 ;');
    });
    it('translates "this"', function() {
      expectTranslate('this.x').to.equal(' this . x ;');
    });
    it('translates "delete"', function() {
      chai.expect(() => translateSource('delete x[y];'))
          .to.throw('delete operator is unsupported');
    });
    it('translates "typeof"', function() {
      chai.expect(() => translateSource('typeof x;'))
          .to.throw('typeof operator is unsupported');
    });
    it('translates "void"', function() {
      chai.expect(() => translateSource('void x;'))
          .to.throw('void operator is unsupported');
    });
  });

  describe('expressions', function() {
    it('translates parens', function() {
      expectTranslate('(1)').to.equal(' ( 1 ) ;');
    });
  });

  describe('comments', () => {
    it('keeps leading comments', () => {
      expectTranslate('/* A */ a\n /* B */ b').to.equal(' /* A */ a ; /* B */ b ;');
      expectTranslate('// A\na\n// B\nb').to.equal(' // A\n a ; // B\n b ;');
    });
  });
});

export function translateSource(contents: string): string {
  var result: string;
  var compilerOptions: ts.CompilerOptions = { target: ts.ScriptTarget.ES6, module: ts.ModuleKind.AMD };
  var compilerHost: ts.CompilerHost = {
    getSourceFile: function (filename, languageVersion) {
      if (filename === 'file.ts')
        return ts.createSourceFile(filename, contents, compilerOptions.target, '0');
      if (filename === 'lib.d.ts')
        return ts.createSourceFile(filename, '', compilerOptions.target, '0');
      return undefined;
    },
    writeFile: function (name, text, writeByteOrderMark) {
      result = text;
    },
    getDefaultLibFilename: function () { return 'lib.d.ts'; },
    useCaseSensitiveFileNames: function () { return false; },
    getCanonicalFileName: function (filename) { return filename; },
    getCurrentDirectory: function () { return ''; },
    getNewLine: function () { return '\n'; }
  };
  // Create a program from inputs
  var program = ts.createProgram(['file.ts'], compilerOptions, compilerHost);
  if (program.getDiagnostics().length > 0) {
    // Throw first error.
    var first = program.getDiagnostics()[0];
    throw new Error(`${first.start}: ${first.messageText} in ${contents}`);
  }
  return main.translateProgram(program);
}
