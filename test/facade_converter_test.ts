/// <reference path="../typings/mocha/mocha.d.ts"/>
import {parseFiles, expectTranslate, expectErroneousCode, translateSource} from './test_support';
import chai = require('chai');

var traceurRuntimeDeclarations = `
    interface Map<K, V> {
      clear(): void;
      delete (key: K): boolean;
      forEach(callbackfn: (value: V, index: K, map: Map<K, V>) => void, thisArg?: any): void;
      keys(): List<K>;
      values(): List<V>;
      get(key: K): V;
      has(key: K): boolean;
      set(key: K, value: V): Map<K, V>;
      size: number;
    }
    declare var Map: {
      new<K, V>(): Map<K, V>;
      // alexeagle: PATCHED
      new<K, V>(m: Map<K, V>): Map<K, V>;
      new<K, V>(l: List<any>): Map<K, V>;
      prototype: Map<any, any>;
    };`;

var langDeclarations = `
  export declare function CONST_EXPR<T>(x: T): T;
  export declare function FORWARD_REF<T>(x: T): T;
  `;

function expectWithTypes(str: string) {
  return expectTranslate(
      {
        'main.ts': str,
        'angular2/traceur-runtime.d.ts': traceurRuntimeDeclarations,
        'angular2/src/facade/lang.d.ts': langDeclarations,
      },
      {translateBuiltins: true, failFast: true});
}

function expectErroneousWithType(str: string) {
  return chai.expect(() => translateSource(
                         {
                           'main.ts': str,
                           'angular2/traceur-runtime.d.ts': traceurRuntimeDeclarations,
                           'angular2/src/facade/lang.d.ts': langDeclarations,
                         },
                         {translateBuiltins: true, failFast: true}));
}


describe('collection façade', () => {
  it('translates array operations to dartisms', () => {
    expectWithTypes('var x: Array<number> = []; x.push(1);')
        .to.equal(' List < num > x = [ ] ; x . add ( 1 ) ;');
    expectWithTypes('var x: Array<number> = []; x.map((e) => e);')
        .to.equal(' List < num > x = [ ] ; x . map ( ( e ) => e ) . toList ( ) ;');
  });

  it('translates map operations to dartisms', () => {
    expectWithTypes('var x: Map<string, string> = new Map(); x.set("k", "v");')
        .to.equal(' Map < String , String > x = new Map ( ) ; x [ "k" ] = "v" ;');
    expectWithTypes('var x: Map<string, string> = new Map(); x.get("k");')
        .to.equal(' Map < String , String > x = new Map ( ) ; x [ "k" ] ;');
  });
});

describe('magic functions', () => {
  it('translates CONST_EXPR(...) to const (...)', () => {
    expectWithTypes('import {CONST_EXPR} from "angular2/src/facade/lang";\n' +
                    'const x = CONST_EXPR([]);')
        .to.equal(' const x = const [ ] ;');
    expectWithTypes('import {CONST_EXPR} from "angular2/src/facade/lang";\n' +
                    'const x = CONST_EXPR(new Person());')
        .to.equal(' const x = const Person ( ) ;');
    expectWithTypes('import {CONST_EXPR} from "angular2/src/facade/lang";\n' +
                    'const x = CONST_EXPR({"one":1});')
        .to.equal(' const x = const { "one" : 1 } ;');
  });

  it('translates FORWARD_REF(() => T) to T', () => {
    expectWithTypes('import {FORWARD_REF} from "angular2/src/facade/lang";\n' +
                    'var x = FORWARD_REF(() => SomeType);')
        .to.equal(' var x = SomeType ;');
    expectErroneousWithType('import {FORWARD_REF} from "angular2/src/facade/lang";\n' +
                            'FORWARD_REF(1)')
        .to.throw(/only arrow functions/);
  });
});

describe('error detection', () => {
  it('for untyped symbols matching special cased fns', () => {
    expectErroneousWithType('FORWARD_REF(1)').to.throw(/Untyped property access to "FORWARD_REF"/);
  });
  it('for untyped symbols matching special cased methods',
     () => { expectErroneousWithType('x.push(1)').to.throw(/Untyped property access to "push"/); });
});