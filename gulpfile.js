require('source-map-support').install();

var clangFormat = require('clang-format');
var formatter = require('gulp-clang-format');
var fs = require('fs');
var fsx = require('fs-extra');
var gulp = require('gulp');
var gutil = require('gulp-util');
var merge = require('merge2');
var mocha = require('gulp-mocha');
var path = require('path');
var sourcemaps = require('gulp-sourcemaps');
var spawn = require('child_process').spawn;
var ts = require('gulp-typescript');
var typescript = require('typescript');
var style = require('dart-style');
var which = require('which');
var tslint = require('gulp-tslint');

gulp.task('test.check-format', function() {
  return gulp.src(['*.js', 'lib/**/*.ts', 'test/**/*.ts'])
      .pipe(formatter.checkFormat('file', clangFormat))
      .on('warning', onError);
});

gulp.task('test.check-lint', function() {
  return gulp.src(['lib/**/*.ts', 'test/**/*.ts'])
      .pipe(tslint())
      .pipe(tslint.report('verbose'))
      .on('warning', onError);
});

var hasError;
var failOnError = true;

var onError = function(err) {
  hasError = true;
  gutil.log(err.message);
  if (failOnError) {
    process.exit(1);
  }
};

var tsProject =
    ts.createProject('tsconfig.json', {noEmit: false, declaration: true, typescript: typescript});

gulp.task('compile', function() {
  hasError = false;
  var tsResult =
      gulp.src(['lib/**/*.ts', 'typings/**/*.d.ts', 'node_modules/typescript/lib/typescript.d.ts'])
          .pipe(sourcemaps.init())
          .pipe(ts(tsProject))
          .on('error', onError);
  return merge([
    tsResult.dts.pipe(gulp.dest('build/definitions')),
    // Write external sourcemap next to the js file
    tsResult.js.pipe(sourcemaps.write('.')).pipe(gulp.dest('build/lib')),
    tsResult.js.pipe(gulp.dest('build/lib')),
  ]);
});

gulp.task('test.compile', ['compile'], function(done) {
  if (hasError) {
    done();
    return;
  }
  return gulp
      .src(
          ['test/*.ts', 'typings/**/*.d.ts', 'node_modules/dart-style/dart-style.d.ts'],
          {base: '.'})
      .pipe(sourcemaps.init())
      .pipe(ts(tsProject))
      .on('error', onError)
      .js.pipe(sourcemaps.write())
      .pipe(gulp.dest('build/'));  // '/test/' comes from base above.
});

gulp.task('test.unit', ['test.compile'], function(done) {
  if (hasError) {
    done();
    return;
  }
  return gulp.src('build/test/**/*.js').pipe(mocha({
    timeout: 4000,  // Needed by the type-based tests :-(
  }));
});

// This test transpiles some unittests to dart and runs them in the Dart VM.
gulp.task('test.e2e', ['test.compile'], function(done) {
  var testfile = 'helloworld';

  // Removes backslashes from __dirname in Windows
  var dir = (__dirname.replace(/\\/g, '/') + '/build/e2e');
  if (fs.existsSync(dir)) fsx.removeSync(dir);
  fs.mkdirSync(dir);
  fsx.copySync(__dirname + '/test/e2e/pubspec.yaml', dir + '/pubspec.yaml');

  // run node with a shell so we can wildcard all the .ts files
  var cmd = 'node build/lib/main.js --translateBuiltins --tsconfig test/e2e/tsconfig.json ' +
      '--generateLibraryName=true ' +
      'test/e2e/*.ts';
  // Paths must be relative to our source root, so run with cwd == dir.
  spawn('sh', ['-c', cmd], {stdio: 'inherit'}).on('close', function(code, signal) {
    if (code > 0) {
      onError(new Error('Failed to transpile ' + testfile + '.ts'));
    } else {
      try {
        var opts = {stdio: 'inherit', cwd: dir};
        // Install the unittest packages on every run, using the content of pubspec.yaml
        // TODO: maybe this could be memoized or served locally?
        spawn(which.sync('pub'), ['install'], opts).on('close', function() {
          // Run the tests using built-in test runner.
          spawn(which.sync('dart'), [testfile + '.dart'], opts).on('close', done);
        });
      } catch (e) {
        console.log('Dart SDK is not found on the PATH:', e.message);
        throw e;
      }
    }
  });
});

gulp.task('test.tsc_e2e', ['test.compile'], function(done) {
  // Test that "tsconfig.json" is read correctly.
  var outDir = (__dirname.replace(/\\/g, '/') + '/build/tsc_e2e');
  if (fs.existsSync(outDir)) fsx.removeSync(outDir);
  fs.mkdirSync(outDir);

  var cmd = 'node build/lib/main.js --translateBuiltins --tsconfig test/tsc_e2e/tsconfig.json ' +
      '--generateLibraryName=true ' +
      'test/tsc_e2e/p1/user.ts';
  spawn('sh', ['-c', cmd], {stdio: 'inherit'}).on('close', function(code, signal) {
    if (code > 0) {
      onError(new Error('Failed to transpile ' + testfile + '.ts'));
      return;
    }
    var content = fs.readFileSync(path.join(outDir, 'p1/user.dart'), 'utf-8');
    if (!content.match(/library p1\.user/) || !content.match(/import "package:mapped\/dep.dart"/) ||
        !content.match(/Future/)) {
      throw new Error('incorrect content in p1.dart:\n' + content)
    }
  });
});

gulp.task(
    'test', ['test.check-format', 'test.check-lint', 'test.unit', 'test.e2e', 'test.tsc_e2e']);

gulp.task('watch', ['test.unit'], function() {
  failOnError = false;
  // Avoid watching generated .d.ts in the build (aka output) directory.
  return gulp.watch(['lib/**/*.ts', 'test/**/*.ts'], {ignoreInitial: true}, ['test.unit']);
});

gulp.task('default', ['compile']);