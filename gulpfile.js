var gulp = require('gulp');
var merge = require('merge2');
var ts = require('gulp-typescript');
var mocha = require('gulp-mocha');

var TSC_OPTIONS = {
  module: "commonjs",
  noExternalResolve: true,
  definitionFiles: true,
  noEmitOnError: true
};
var tsProject = ts.createProject(TSC_OPTIONS);

gulp.task('compile', function() {
  var tsResult = gulp.src(['*.ts', 'typings/**/*'])
      .pipe(ts(tsProject));
  return merge([
    tsResult.dts.pipe(gulp.dest('release/definitions')),
    tsResult.js.pipe(gulp.dest('release/js'))
  ]);
});

gulp.task('test.compile', ['compile'], function() {
  return gulp.src(['test/*.ts', '*.ts', 'typings/**/*'])
      .pipe(ts(TSC_OPTIONS))
      .js.pipe(gulp.dest('release/js/test'));
});

gulp.task('test', ['test.compile'], function() {
  return gulp.src('release/js/test/*').pipe(mocha({reporter: 'nyan'}));
});

gulp.task('watch', ['test'], function() {
  return gulp.watch('**/*.ts', ['test']);
});

