/// <reference path="../typings/mocha/mocha.d.ts"/>
import {FAKE_MAIN, expectTranslate, translateSource} from './test_support';

import chai = require('chai');

function getSources(str: string): {[k: string]: string} {
  let srcs: {[k: string]: string} = {
    'angular2/src/core/di/forward_ref.d.ts': `
        export declare function forwardRef<T>(x: T): T;`,
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
        export class Promise {}
    `,
  };
  srcs[FAKE_MAIN] = str;
  return srcs;
}

const COMPILE_OPTS = {
  translateBuiltins: true,
  failFast: true,
  typingsRoot: 'some/path/to/typings/',
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
          'import {Observable} from "angular2/src/facade/async"; var o: Observable<Date>;')
          .to.equal(`import "package:angular2/src/facade/async.dart" show Stream;

Stream<DateTime> o;`);
      expectWithTypes('var p: Promise<void> = x;').to.equal(`import "dart:async";

Future p = x;`);
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

    it('does not substitute all identifiers',
       () => { expectWithTypes('let Promise = 1;').to.equal(`var Promise = 1;`); });
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

    it('translates console.log', () => {
      expectWithTypes(`console.log(1);`).to.equal('print(1);');
      expectWithTypes(`console.log(1, 2);`).to.equal('print([1, 2].join(" "));');
    });

    it('translates string methoids',
       () => { expectErroneousWithType(`var x = 'asd'.substr(0, 1);`).to.throw(/use substring/); });

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
    expectWithTypes('function f() { var result = /a(.)/g.exec("ab")[1]; }').to.equal(`f() {
  var result = new RegExp(r'a(.)').firstMatch("ab")[1];
}`);
    expectWithTypes('function f() { let groups = /a(.)/g.exec("ab"); }').to.equal(`f() {
  var groups = ((match) => new List.generate(
      1 + match.groupCount, match.group))(new RegExp(r'a(.)').firstMatch("ab"));
}`);
    expectErroneousWithType('function f() { var x = /a(.)/g; x.exec("ab")[1]; }')
        .to.throw(
            'exec is only supported on regexp literals, ' +
            'to avoid side-effect of multiple calls on global regexps.');
  });

  describe('promises', () => {
    it('translates into Futures', () => {
      expectWithTypes('let x: Promise = Promise.resolve(1);').to.equal(`import "dart:async";

Future x = new Future.value(1);`);
      expectWithTypes('let x: Promise = Promise.reject(1);').to.equal(`import "dart:async";

Future x = new Future.error(1);`);
      expectWithTypes('let x: Promise = new Promise((resolve) => {resolve(1);});')
          .to.equal(`import "dart:async";

Future x = (() {
  Completer _completer$$ts2dart$0 = new Completer();
  var resolve = _completer$$ts2dart$0.complete;
  (() {
    resolve(1);
  })();
  return _completer$$ts2dart$0.future;
})();`);
      expectWithTypes('let x: Promise = new Promise((resolve, reject) => {resolve(1);});')
          .to.equal(`import "dart:async";

Future x = (() {
  Completer _completer$$ts2dart$0 = new Completer();
  var resolve = _completer$$ts2dart$0.complete;
  var reject = _completer$$ts2dart$0.completeError;
  (() {
    resolve(1);
  })();
  return _completer$$ts2dart$0.future;
})();`);
      expectWithTypes('let x: Promise = new Promise((myParam1, myParam2) => {myParam1(1);});')
          .to.equal(`import "dart:async";

Future x = (() {
  Completer _completer$$ts2dart$0 = new Completer();
  var myParam1 = _completer$$ts2dart$0.complete;
  var myParam2 = _completer$$ts2dart$0.completeError;
  (() {
    myParam1(1);
  })();
  return _completer$$ts2dart$0.future;
})();`);
      expectWithTypes(
          'let x: Promise<any> = new Promise((resolve, reject) => {resolve(1);});' +
          'function fn(): void { x.then((v) => { console.log(v) }).catch((err) => { console.log(err); }); }')
          .to.equal(`import "dart:async";

Future<dynamic> x = (() {
  Completer _completer$$ts2dart$0 = new Completer();
  var resolve = _completer$$ts2dart$0.complete;
  var reject = _completer$$ts2dart$0.completeError;
  (() {
    resolve(1);
  })();
  return _completer$$ts2dart$0.future;
})();
void fn() {
  x.then((v) {
    print(v);
  }).catchError((err) {
    print(err);
  });
}`);
      expectWithTypes(
          'var fn: () => Promise<number>;' +
          'function main() { fn().then((v) => { console.log(v) }).catch((err) => { console.log(err); }); }')
          .to.equal(`import "dart:async";

dynamic /* () => Promise<number> */ fn;
main() {
  fn().then((v) {
    print(v);
  }).catchError((err) {
    print(err);
  });
}`);
      expectWithTypes(
          'var fn: () => Promise<number>;' +
          'function main() { fn().then((v) => { console.log(v) }, (err) => { console.log(err); }); }')
          .to.equal(`import "dart:async";

dynamic /* () => Promise<number> */ fn;
main() {
  fn().then((v) {
    print(v);
  }).catchError((err) {
    print(err);
  });
}`);
    });
  });

  describe(
      'builtin functions', () => {
        it('translates CONST_EXPR(...) to const (...)', () => {
          expectWithTypes(
              'import {CONST_EXPR} from "angular2/src/facade/lang";\n' +
              'const x = CONST_EXPR(1);')
              .to.equal('const x = 1;');
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

          expectWithTypes(`
            import {CONST_EXPR} from "angular2/src/facade/lang";
            const _EMPTY_LIST = CONST_EXPR([]);`)
              .to.equal(`const _EMPTY_LIST = const [];`);
          expectWithTypes(`
            import {CONST_EXPR} from "angular2/src/facade/lang";
            const _EMPTY_LIST = CONST_EXPR(<string[]>[]);`)
              .to.equal(`const _EMPTY_LIST = const <String>[];`);
          expectWithTypes(`
            import {CONST_EXPR} from "angular2/src/facade/lang";
            const MY_MAP = CONST_EXPR(<{[k: string]: number}>{});`)
              .to.equal(`const MY_MAP = const <String, num>{};`);
        });

        it('translates comment /* @ts2dart_const */ (...) to const (...)', () => {
          expectWithTypes('const x = /* @ts2dart_const */ (1);').to.equal('const x = (1);');
          expectWithTypes('const x = /* @ts2dart_const */ 1 + 2;').to.equal('const x = 1 + 2;');
          expectWithTypes(`const x = /* @ts2dart_const */ [];`).to.equal('const x = const [];');
          // Nested expressions.
          expectWithTypes(`const x = /* @ts2dart_const */ [[1]];`).to.equal(`const x = const [
  const [1]
];`);
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

describe('@ts2dart_Provider', () => {
  it('transforms expressions', () => {
    expectWithTypes(`
var x = /* @ts2dart_Provider */ {
  provide: SomeThing, useClass: XHRImpl, multi: true
};`).to.equal(`import "package:angular2/core.dart" show Provider;

var x = const Provider(SomeThing, useClass: XHRImpl, multi: true);`);
  });

  it('does not add multiple imports', () => {
    expectWithTypes(`
import {Provider} from 'angular2/core';
var x = /* @ts2dart_Provider */ {provide: SomeThing, useClass: X};`)
        .to.equal(`import "package:angular2/core.dart" show Provider;

var x = const Provider(SomeThing, useClass: X);`);
  });
});
