/// <reference path="../typings/mocha/mocha.d.ts"/>
import {
  parseFiles,
  expectTranslate,
  FAKE_MAIN,
  expectErroneousCode,
  translateSource
} from './test_support';
import chai = require('chai');

var es6RuntimeDeclarations = `
    interface Iterable<T> {}
    interface Symbol {}
    interface Map<K, V> {
      get(key: K): V;
      has(key: K): boolean;
      set(key: K, value: V): Map<K, V>;
      size: number;
      delete(key: K): boolean;
      forEach(callbackfn: (value: V, index: K, map: Map<K, V>) => void, thisArg?: any): void;
    }
    interface Array<T> {
      find(predicate: (value: T, index: number, obj: Array<T>) => boolean, thisArg?: any): T;
    }
    declare var Map: {
      new<K, V>(): Map<any, any>;
      prototype: Map<any, any>;
    };
    declare var Symbol;
    `;


function getSources(str: string): {[k: string]: string} {
  var srcs: {[k: string]: string} = {
    'angular2/typings/es6-shim/es6-shim': es6RuntimeDeclarations,
    'angular2/src/core/di/forward_ref.d.ts': `
        export declare function forwardRef<T>(x: T): T;`,
    'angular2/typings/es6-promise/es6-promise.d.ts': `
        declare class Promise<R> {}
        declare module Promise {}`,
    'node_modules/rxjs/Observable.d.ts': `
        export declare class Observable {}`,
    'angular2/src/facade/async.ts': `
        export {Observable} from 'rxjs/Observable';`,
    'angular2/src/facade/collection.ts': `
        export declare var Map;`,
    'angular2/src/facade/lang.d.ts': `
        interface List<T> extends Array<T> {}
        export declare function CONST_EXPR<T>(x: T): T;
        export declare var normalizeBlank: (x: Object) => any;`,
    'other/file.ts': `
        export class X {
          map(x: number): string { return String(x); }
          static get(m: any, k: string): number { return m[k]; }
        }
        var global: any;
        export var Promise = global.Promise;`,
  };
  srcs[FAKE_MAIN] = str;
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
      expectWithTypes('import {Observable} from "angular2/src/facade/async"; var p: Promise<Date>;')
          .to.equal(`import "dart:async";
import "package:angular2/src/facade/async.dart" show Stream;

Future<DateTime> p;`);
      expectWithTypes('var y: Promise;').to.equal(`import "dart:async";

Future y;`);
      expectWithTypes('var n: Node;').to.equal('dynamic n;');
      expectWithTypes('var xhr: XMLHttpRequest;').to.equal(`import "dart:html";

HttpRequest xhr;`);
      expectWithTypes('var intArray: Uint8Array;').to.equal(`import "dart:typed_arrays";

Uint8List intArray;`);
      expectWithTypes('var buff: ArrayBuffer;').to.equal(`import "dart:typed_arrays";

ByteBuffer buff;`);
    });

    it('allows undeclared types', () => { expectWithTypes('var t: Thing;').to.equal('Thing t;'); });

    it('does not substitute matching name from different file', () => {
      expectWithTypes('import {Promise} from "other/file"; var y = x instanceof Promise;')
          .to.equal(`import "package:other/file.dart" show Promise;

var y = x is Promise;`);
    });
  });

  describe('collection façade', () => {
    it('translates array operations to dartisms', () => {
      expectWithTypes('function f() { var x: Array<number> = []; x.push(1); x.pop(); }')
          .to.equal(`f() {
  List<num> x = [];
  x.add(1);
  x.removeLast();
}`);
      expectWithTypes('function f() { var x: Array<number> = []; x.map((e) => e); }')
          .to.equal(`f() {
  List<num> x = [];
  x.map((e) => e).toList();
}`);
      expectWithTypes('function f() { var x: Array<number> = []; x.filter((e) => true); }')
          .to.equal(`f() {
  List<num> x = [];
  x.where((e) => true).toList();
}`);
      expectWithTypes('function f() { var x: Array<number> = []; x.unshift(1, 2, 3); x.shift(); }')
          .to.equal(`f() {
  List<num> x = [];
  (x..insertAll(0, [1, 2, 3])).length;
  x.removeAt(0);
}`);
      expectWithTypes('function f() { var x: Array<number> = []; x.unshift(1); }').to.equal(`f() {
  List<num> x = [];
  (x..insert(0, 1)).length;
}`);
      expectWithTypes('function f() { var x: Array<number> = []; x.concat([1], x).length; }')
          .to.equal(`f() {
  List<num> x = [];
  (new List.from(x)..addAll([1])..addAll(x)).length;
}`);
      expectWithTypes('var x: Array<number> = []; var y: Array<number> = x.slice(0);')
          .to.equal(`List<num> x = [];
List<num> y = ListWrapper.slice(x, 0);`);
      expectWithTypes('var x: Array<number> = []; var y: Array<number> = x.splice(0,1);')
          .to.equal(`List<num> x = [];
List<num> y = ListWrapper.splice(x, 0, 1);`);
      expectWithTypes('var x: Array<number> = []; var y: string = x.join("-");')
          .to.equal(`List<num> x = [];
String y = x.join("-");`);
      expectWithTypes('var x: Array<number> = []; var y: string = x.join();')
          .to.equal(`List<num> x = [];
String y = x.join(",");`);
      expectWithTypes('var x: Array<number> = []; var y: number = x.find((e) => e == 0);')
          .to.equal(`List<num> x = [];
num y = x.firstWhere((e) => e == 0, orElse: () => null);`);
      expectWithTypes('var x: Array<number> = []; var y: boolean = x.some((e) => e == 0);')
          .to.equal(`List<num> x = [];
bool y = x.any((e) => e == 0);`);
      expectWithTypes('var x: Array<number> = []; var y: number = x.reduce((a, b) => a + b, 0);')
          .to.equal(`List<num> x = [];
num y = x.fold(0, (a, b) => a + b);`);
      expectWithTypes('var x: Array<number> = []; var y: number = x.reduce((a, b) => a + b);')
          .to.equal(`List<num> x = [];
num y = x.fold(null, (a, b) => a + b);`);
    });

    it('translates map operations to dartisms', () => {
      expectWithTypes('function f() { var x = new Map<string, string>(); x.set("k", "v"); }')
          .to.equal(`f() {
  var x = new Map<String, String>();
  x["k"] = "v";
}`);
      expectWithTypes('function f() { var x = new Map<string, string>(); x.get("k"); }')
          .to.equal(`f() {
  var x = new Map<String, String>();
  x["k"];
}`);
      expectWithTypes('function f() { var x = new Map<string, string>(); x.has("k"); }')
          .to.equal(`f() {
  var x = new Map<String, String>();
  x.containsKey("k");
}`);
      expectWithTypes('function f() { var x = new Map<string, string>(); x.delete("k"); }')
          .to.equal(`f() {
  var x = new Map<String, String>();
  (x.containsKey("k") && (x.remove("k") != null || true));
}`);
      expectWithTypes(
          'function f() { var x = new Map<string, string>(); x.forEach((v, k) => null); }')
          .to.equal(`f() {
  var x = new Map<String, String>();
  x.forEach((k, v) => null);
}`);
      expectWithTypes(
          'function f() { var x = new Map<string, string>(); x.forEach(function (v, k) { return null; }); }')
          .to.equal(`f() {
  var x = new Map<String, String>();
  x.forEach((k, v) {
    return null;
  });
}`);
      expectWithTypes(
          'function f() { var x = new Map<string, string>(); var y = x.forEach((v, k) => { return null; }); }')
          .to.equal(`f() {
  var x = new Map<String, String>();
  var y = x.forEach((k, v) {
    return null;
  });
}`);

      expectWithTypes('function f() { var x = new Map<string, string>(); x.forEach(fn); }')
          .to.equal(`f() {
  var x = new Map<String, String>();
  x.forEach((k, v) => (fn)(v, k));
}`);
    });

    it('translates map properties to dartisms', () => {
      expectWithTypes('var x = new Map<string, string>();var y = x.size;')
          .to.equal(`var x = new Map<String, String>();
var y = x.length;`);
    });
  });

  describe('regexp', () => {
    expectWithTypes('function f() { var x = /a/g; x.test("a"); }').to.equal(`f() {
  var x = new RegExp(r'a');
  x.hasMatch("a");
}`);
  });

  describe(
      'builtin functions', () => {
        it('translates CONST_EXPR(...) to const (...)', () => {
          expectWithTypes(
              'import {CONST_EXPR} from "angular2/src/facade/lang";\n' +
              'const x = CONST_EXPR([]);')
              .to.equal('const x = const [];');
          expectWithTypes(
              'import {CONST_EXPR} from "angular2/src/facade/lang";\n' +
              'class Person {}' +
              'const x = CONST_EXPR(new Person());')
              .to.equal(`class Person {}

const x = const Person();`);
          expectWithTypes(
              'import {CONST_EXPR} from "angular2/src/facade/lang";\n' +
              'const x = CONST_EXPR({"one":1});')
              .to.equal('const x = const {"one": 1};');
          expectWithTypes(
              'import {CONST_EXPR} from "angular2/src/facade/lang";\n' +
              'import {Map} from "angular2/src/facade/collection";\n' +
              'const x = CONST_EXPR(new Map());')
              .to.equal(`import "package:angular2/src/facade/collection.dart" show Map;

const x = const {};`);
          expectWithTypes(
              'import {CONST_EXPR} from "angular2/src/facade/lang";\n' +
              'import {Map} from "angular2/src/facade/collection";\n' +
              'const x = CONST_EXPR(new Map<number, string>());')
              .to.equal(`import "package:angular2/src/facade/collection.dart" show Map;

const x = const <num, String>{};`);
        });

        it('translates forwardRef(() => T) to T',
           () => {
             expectWithTypes(
                 'import {forwardRef} from "angular2/src/core/di/forward_ref";\n' +
                 'var SomeType = 1;\n' +
                 'var x = forwardRef(() => SomeType);')
                 .to.equal(`var SomeType = 1;
var x = SomeType;`);
             expectErroneousWithType(`import {forwardRef} from "angular2/src/core/di/forward_ref";
forwardRef(1)`).to.throw(/only arrow functions/);
           });

        it('erases calls to normalizeBlank', () => {
          expectWithTypes(
              'import {normalizeBlank} from "angular2/src/facade/lang";\n' +
              'var x = normalizeBlank([]);')
              .to.equal('var x = [];');
        });
      });

  it('translates array façades', () => {
    expectWithTypes('function f() { var x = []; Array.isArray(x); }').to.equal(`f() {
  var x = [];
  ((x) is List);
}`);
  });

  describe('error detection', () => {
    describe('Map', () => {
      it('.forEach() should report an error when the callback doesn\'t have 2 args', () => {
        expectErroneousWithType('var x = new Map<string, string>(); x.forEach((v, k, m) => null);')
            .to.throw('Map.forEach callback requires exactly two arguments');
      });
    });

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
      expectWithTypes(
          'import {X} from "other/file";\n' +
          'var y = new X().map(1)')
          .to.equal(`import "package:other/file.dart" show X;

var y = new X().map(1);`);
      expectWithTypes(`import {X} from "other/file";
var y = X.get({"a": 1}, "a");`)
          .to.equal(`import "package:other/file.dart" show X;

var y = X.get({"a": 1}, "a");`);
      expectWithTypes('["a", "b"].map((x) => x);').to.equal('["a", "b"].map((x) => x).toList();');
    });
  });
});
