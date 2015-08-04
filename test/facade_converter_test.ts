/// <reference path="../typings/mocha/mocha.d.ts"/>
import {parseFiles, expectTranslate, expectErroneousCode, translateSource} from './test_support';
import chai = require('chai');

var traceurRuntimeDeclarations = `
    interface Iterable<T> {}
    interface Symbol {}
    interface Map<K, V> {
      get(key: K): V;
      has(key: K): boolean;
      set(key: K, value: V): Map<K, V>;
      size: number;
      delete(key: K): boolean;
    }
    declare var Map: {
      new<K, V>(): Map<any, any>;
      prototype: Map<any, any>;
    };
    declare var Symbol;
    `;


function getSources(str: string): {[k: string]: string} {
  var srcs: {[k: string]: string} = {
    'angular2/traceur-runtime.d.ts': traceurRuntimeDeclarations,
    'angular2/src/di/forward_ref.d.ts': `
        export declare function forwardRef<T>(x: T): T;`,
    'angular2/typings/es6-promise/es6-promise.d.ts': `
        declare class Promise<R> {}`,
    'angular2/src/facade/async.d.ts': `
        export {Promise};
        export declare class Observable {};`,
    'angular2/src/facade/collection.d.ts': `
        export declare var Map: typeof Map;`,
    'angular2/src/facade/lang.d.ts': `
        interface List<T> extends Array<T> {}
        export declare function CONST_EXPR<T>(x: T): T;
        export declare var normalizeBlank: (x: Object) => any;`,
    'other/file.ts': `
        export class X {
          map(x: number): string { return String(x); }
          static get(m: any, k: string): number { return m[k]; }
        }
        export declare var Promise = (<any>global).Promise;`,
  };
  srcs['main.ts'] = str;
  return srcs;
}

const COMPILE_OPTS = {
  translateBuiltins: true,
  failFast: true
};

function expectWithTypes(str: string) {
  return expectTranslate(getSources(str), COMPILE_OPTS);
}

function expectErroneousWithType(str: string) {
  return chai.expect(() => translateSource(getSources(str), COMPILE_OPTS));
}

describe('type based translation', () => {
  describe('Dart type substitution', () => {
    it('finds registered substitutions', () => {
      expectWithTypes(
          'import {Promise, Observable} from "angular2/src/facade/async"; var p: Promise<Date>;')
          .to.equal(
              ' import "package:angular2/src/facade/async.dart" show Future , Stream ; Future < DateTime > p ;');
      expectWithTypes('import {Promise} from "angular2/src/facade/async"; x instanceof Promise;')
          .to.equal(' import "package:angular2/src/facade/async.dart" show Future ; x is Future ;');
      expectWithTypes('var n: Node;').to.equal(' dynamic n ;');
      expectWithTypes('var _xhr: XMLHttpRequest;')
          .to.equal(' import "dart:html"; HttpRequest _xhr ;');
    });

    it('allows undeclared types',
       () => { expectWithTypes('var t: Thing;').to.equal(' Thing t ;'); });

    it('does not substitute matching name from different file', () => {
      expectWithTypes('import {Promise} from "other/file"; x instanceof Promise;')
          .to.equal(' import "package:other/file.dart" show Promise ; x is Promise ;');
    });
  });

  describe('collection façade', () => {
    it('translates array operations to dartisms', () => {
      expectWithTypes('var x: Array<number> = []; x.push(1); x.pop();')
          .to.equal(' List < num > x = [ ] ; x . add ( 1 ) ; x . removeLast ( ) ;');
      expectWithTypes('var x: Array<number> = []; x.map((e) => e);')
          .to.equal(' List < num > x = [ ] ; x . map ( ( e ) => e ) . toList ( ) ;');
      expectWithTypes('var x: Array<number> = []; x.unshift(1, 2, 3); x.shift();')
          .to.equal(' List < num > x = [ ] ; ( x .. insertAll ' +
                    '( 0, [ 1 , 2 , 3 ]) ) . length ; x . removeAt ( 0 ) ;');
      expectWithTypes('var x: Array<number> = []; x.unshift(1);')
          .to.equal(' List < num > x = [ ] ; ( x .. insert ( 0, 1 ) ) . length ;');
      expectWithTypes('var x: Array<number> = []; x.concat([1], x);')
          .to.equal(
              ' List < num > x = [ ] ; new List . from ( x ) .. addAll ( [ 1 ] ) .. addAll ( x ) ;');
      expectWithTypes('var x: Array<number> = []; var y: Array<number> = x.slice(0);')
          .to.equal(' List < num > x = [ ] ; List < num > y = ListWrapper.slice ( x , 0 ) ;');
      expectWithTypes('var x: Array<number> = []; var y: Array<number> = x.splice(0,1);')
          .to.equal(' List < num > x = [ ] ; List < num > y = ListWrapper.splice ( x , 0 , 1 ) ;');
    });

    it('translates map operations to dartisms', () => {
      expectWithTypes('var x = new Map<string, string>(); x.set("k", "v");')
          .to.equal(' var x = new Map < String , String > ( ) ; x [ "k" ] = "v" ;');
      expectWithTypes('var x = new Map<string, string>(); x.get("k");')
          .to.equal(' var x = new Map < String , String > ( ) ; x [ "k" ] ;');
      expectWithTypes('var x = new Map<string, string>(); x.has("k");')
          .to.equal(' var x = new Map < String , String > ( ) ; x . containsKey ( "k" ) ;');
      expectWithTypes('var x = new Map<string, string>(); x.delete("k");')
          .to.equal(' var x = new Map < String , String > ( ) ; ' +
                    '( x . containsKey ( "k" ) && ( x . remove ( "k" ) != null || true ) ) ;');
    });

    it('translates map properties to dartisms', () => {
      expectWithTypes('var x = new Map<string, string>(); x.size;')
          .to.equal(' var x = new Map < String , String > ( ) ; x . length ;');
    });
  });

  describe('regexp', () => {
    expectWithTypes('var x = /a/g; x.test("a");')
        .to.equal(' var x = new RegExp ( r\'a\' ) ; x . hasMatch ( "a" ) ;');
  });

  describe('builtin functions', () => {
    it('translates CONST_EXPR(...) to const (...)', () => {
      expectWithTypes('import {CONST_EXPR} from "angular2/src/facade/lang";\n' +
                      'const x = CONST_EXPR([]);')
          .to.equal(' const x = const [ ] ;');
      expectWithTypes('import {CONST_EXPR} from "angular2/src/facade/lang";\n' +
                      'class Person {}' +
                      'const x = CONST_EXPR(new Person());')
          .to.equal(' class Person { } const x = const Person ( ) ;');
      expectWithTypes('import {CONST_EXPR} from "angular2/src/facade/lang";\n' +
                      'const x = CONST_EXPR({"one":1});')
          .to.equal(' const x = const { "one" : 1 } ;');
      expectWithTypes('import {CONST_EXPR} from "angular2/src/facade/lang";\n' +
                      'import {Map} from "angular2/src/facade/collection";\n' +
                      'const x = CONST_EXPR(new Map());')
          .to.equal(' import "package:angular2/src/facade/collection.dart" show Map ;' +
                    ' const x = const { } ;');
      expectWithTypes('import {CONST_EXPR} from "angular2/src/facade/lang";\n' +
                      'import {Map} from "angular2/src/facade/collection";\n' +
                      'const x = CONST_EXPR(new Map<number, string>());')
          .to.equal(' import "package:angular2/src/facade/collection.dart" show Map ;' +
                    ' const x = const < num , String > { } ;');
    });

    it('translates forwardRef(() => T) to T', () => {
      expectWithTypes('import {forwardRef} from "angular2/src/di/forward_ref";\n' +
                      'var SomeType = 1;\n' +
                      'var x = forwardRef(() => SomeType);')
          .to.equal(' var SomeType = 1 ; var x = SomeType ;');
      expectErroneousWithType('import {forwardRef} from "angular2/src/di/forward_ref";\n' +
                              'forwardRef(1)')
          .to.throw(/only arrow functions/);
    });

    it('erases calls to normalizeBlank', () => {
      expectWithTypes('import {normalizeBlank} from "angular2/src/facade/lang";\n' +
                      'var x = normalizeBlank([]);')
          .to.equal(' var x = [ ] ;');
    });
  });

  it('translates array façades', () => {
    expectWithTypes('var x = []; Array.isArray(x);').to.equal(' var x = [ ] ; ( ( x ) is List ) ;');
  });

  describe('error detection', () => {
    describe('Array', () => {
      it('.concat() should report an error if any arg is not an Array', () => {
        expectErroneousWithType('var x: Array<number> = []; x.concat(1);')
            .to.throw('Array.concat only takes Array arguments');
      });
    });

    it('for untyped symbols matching special cased fns', () => {
      expectErroneousWithType('forwardRef(1)').to.throw(/Untyped property access to "forwardRef"/);
    });

    it('for untyped symbols matching special cased methods', () => {
      expectErroneousWithType('x.push(1)').to.throw(/Untyped property access to "push"/);
    });

    it('allows unrelated methods', () => {
      expectWithTypes('import {X} from "other/file";\n' +
                      'new X().map(1)')
          .to.equal(' import "package:other/file.dart" show X ; new X ( ) . map ( 1 ) ;');
      expectWithTypes('import {X} from "other/file";\n' +
                      'X.get({"a": 1}, "a");')
          .to.equal(' import "package:other/file.dart" show X ; X . get ( { "a" : 1 } , "a" ) ;');
      expectWithTypes('["a", "b"].map((x) => x);')
          .to.equal(' [ "a" , "b" ] . map ( ( x ) => x ) . toList ( ) ;');
    });
  });
});
