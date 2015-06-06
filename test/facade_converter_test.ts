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

var otherFile = `
  export class X { map(x: number): string { return String(x); } }
  `;

function getSrcs(str: string): {[k: string]: string} {
  var srcs: {[k: string]: string} = {
    'angular2/traceur-runtime.d.ts': traceurRuntimeDeclarations,
    'angular2/src/facade/lang.d.ts': langDeclarations,
    'other/file.ts': otherFile,
  };
  srcs['main.ts'] = str;
  return srcs;
}

const COMPILE_OPTS = {translateBuiltins: true, failFast: true};

function expectWithTypes(str: string) {
  return expectTranslate(getSrcs(str), COMPILE_OPTS);
}

function expectErroneousWithType(str: string) {
  return chai.expect(() => translateSource(getSrcs(str), COMPILE_OPTS));
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

describe('builtin functions', () => {
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
  it.only('allows unrelated methods', () => {
    expectWithTypes('import {map} from "other/file";\n' +
                    'new X().map(1)')
        .to.equal(' import "package:other/file.dart" show map ; new X ( ) . map ( 1 ) ;');
  });
});