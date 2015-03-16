require('source-map-support').install();

var formatter = require('gulp-clang-format');
var fs = require('fs');
var gulp = require('gulp');
var merge = require('merge2');
var mocha = require('gulp-mocha');
var sourcemaps = require('gulp-sourcemaps');
var spawn = require('child_process').spawn;
var tmpdir = require('os').tmpdir;
var ts = require('gulp-typescript');
var which = require('which');

var TSC_OPTIONS = {
  module: "commonjs",
  // allow pulling in files from node_modules
  // until TS 1.5 is in tsd / DefinitelyTyped
  // (the alternative is to include node_modules paths
  // in the src arrays below for compilation)
  noExternalResolve: false,
  definitionFiles: true,
  noEmitOnError: true,
};
var tsProject = ts.createProject(TSC_OPTIONS);

gulp.task('check-format', function() {
  return gulp.src(['*.js', '*.ts', 'test/*.ts']).pipe(formatter.checkFormat('file'));
});

var hasCompileError;
var onCompileError = function(err) {
  hasCompileError = true;
};

gulp.task('compile', function() {
  hasCompileError = false;
  var tsResult = gulp.src(['*.ts', 'typings/**/*'])
                     .pipe(sourcemaps.init())
                     .pipe(ts(tsProject))
                     .on('error', onCompileError);
  return merge([
    tsResult.dts.pipe(gulp.dest('release/definitions')),
    tsResult.js.pipe(sourcemaps.write()),
    tsResult.js.pipe(gulp.dest('release/js')),
  ]);
});

gulp.task('test.compile', ['compile'], function(done) {
  if (hasCompileError) {
    done();
    return;
  }
  return gulp.src(['test/*.ts', '*.ts', 'typings/**/*'])
      .pipe(sourcemaps.init())
      .pipe(ts(tsProject))
      .on('error', onCompileError)
      .js.pipe(sourcemaps.write())
      .pipe(gulp.dest('release/js/test'));
});

gulp.task('test.unit', ['test.compile'], function(done) {
  if (hasCompileError) {
    done();
    return;
  }
  return gulp.src('release/js/test/*.js').pipe(mocha({reporter: 'nyan'}));
});

// This test transpiles some unittests to dart and runs them in the Dart VM.
gulp.task('test.e2e', ['test.compile'], function(done) {
  var main = require('./release/js/main');
  var testfile = 'helloworld';

  // Set up the test env in a hermetic tmp dir
  var dir = tmpdir() + '/' + Date.now();
  fs.mkdirSync(dir);
  fs.symlinkSync(__dirname + '/test/e2e/pubspec.yaml', dir + '/pubspec.yaml');
  fs.writeFileSync(dir + '/' + testfile + '.dart',
                   main.translateFiles(['test/e2e/' + testfile + '.ts']), {encoding: 'utf8'});

  try {
    var opts = {stdio: 'inherit', cwd: dir};
    // Install the unittest packages on every run, using the content of pubspec.yaml
    // TODO: maybe this could be memoized or served locally?
    spawn(which.sync('pub'), ['install'], opts)
        .on('close', function() {
          // Run the tests using built-in test runner.
          spawn(which.sync('dart'), [testfile + '.dart'], opts).on('close', done);
        });
  } catch (e) {
    console.log('Dart SDK is not found on the PATH.');
    throw e;
  }
});

gulp.task('test', ['test.unit', 'test.e2e']);

gulp.task('watch', ['test'], function() { return gulp.watch('**/*.ts', ['test']); });
