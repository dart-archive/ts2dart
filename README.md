# TypeScript to Dart transpiler [![Build Status](https://travis-ci.org/angular/ts2dart.svg?branch=master)](https://travis-ci.org/angular/ts2dart)

ts2dart is a TypeScript to Dart transpiler. It's mainly used to translate Angular 2 from TypeScript
to Dart for its Dart user base.

## Usage

- To install as Command Line Tool execute: `npm i -g ts2dart`
- Once installed you could run it doing: `ts2dart inputFile.ts`

## Installation

- execute `npm i` to install the dependencies,
- the Dart SDK must be available to run end to end tests.

## Gulp tasks

- `gulp watch` executes the unit tests in watch mode (use `gulp test.unit` for a single run),
- `gulp test.e2e` executes the e2e tests,
- `gulp test.check-format` checks the source code formatting using `clang-format`,
- `gulp test` runs unit tests, e2e tests and checks the source code formatting.

## Phabricator Reviews

You can send pull requests via Github, or by creating a Phabricator diff on
https://reviews.angular.io. Both are fine, though Phabricator has a nicer code review UI.

To create a Phabricator diff:

- create an account on https://reviews.angular.io
- install [Arcanist](https://secure.phabricator.com/book/phabricator/article/arcanist/)
- run `arc diff` to upload a diff (= pull request). This will also run all tests.
- get it reviewed by entering a "Reviewer", e.g. "mprobst", "alexeagle", "viks", ...
