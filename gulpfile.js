require('source-map-support').install();

var formatter = require('gulp-clang-format');
var fs = require('fs');
var gulp = require('gulp');
var merge = require('merge2');
var mocha = require('gulp-mocha');
var sourcemaps = require('gulp-sourcemaps');
var spawn = require('child_process').spawn;
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
  return gulp.src('*.ts')
      .pipe(formatter.checkFormat('file'));
});

gulp.task('compile', function() {
  var tsResult = gulp.src(['*.ts', 'typings/**/*'])
      .pipe(sourcemaps.init())
      .pipe(ts(tsProject));
  return merge([
    tsResult.dts.pipe(gulp.dest('release/definitions')),
    tsResult.js.pipe(sourcemaps.write()),
    tsResult.js.pipe(gulp.dest('release/js')),
  ]);
});

gulp.task('test.compile', ['compile'], function() {
  return gulp.src(['test/*.ts', '*.ts', 'typings/**/*'])
      .pipe(sourcemaps.init())
      .pipe(ts(TSC_OPTIONS))
      .js.pipe(sourcemaps.write())
         .pipe(gulp.dest('release/js/test'));
});

gulp.task('test', ['test.compile'], function() {
  return gulp.src('release/js/test/*.js').pipe(mocha({reporter: 'nyan'}));
});

gulp.task('test.e2e', ['test.compile'], function(done) {
  var main = require('./main');
  fs.writeFileSync('test/e2e/helloworld.dart',
      main.translateFiles(['test/e2e/helloworld.ts']),
      {encoding:'utf8'});
  try {
    var dart = which.sync('dart');
    var process = spawn(dart, ['test/e2e/helloworld.dart'], {stdio:'inherit'});
    process.on('close', done);
  } catch (e) {
    console.log('Dart SDK is not found on the PATH.');
    throw e;
  }
});

gulp.task('watch', ['test'], function() {
  return gulp.watch('**/*.ts', ['test']);
});

