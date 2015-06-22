# TypeScript to Dart transpiler [![Build Status](https://travis-ci.org/angular/ts2dart.svg?branch=master)](https://travis-ci.org/angular/ts2dart)


ts2dart is a TypeScript to Dart transpiler. It's in its very early days and under heavy development,
not ready for production use.

## Installation

- execute `npm i` to install the dependencies,
- the Dart SDK must be available to run end to end tests.

## Gulp tasks

- `gulp watch` executes the unit tests in watch mode (use `gulp test.unit` for a single run),
- `gulp test.e2e` executes the e2e tests,
- `gulp test.check-format` checks the source code formatting using `clang-format`,
- `gulp test` runs unit tests, e2e tests and checks the source code formatting.
