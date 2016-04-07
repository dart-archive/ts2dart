import * as fs from 'fs';
import * as path from 'path';

export default function mkdirP(p: string) {
  // Convert input path to absolute and then relative so that we always have relative path in the
  // end. This can be made simpler when path.isAbsolute is available in node v0.12.
  p = path.resolve(p);
  p = path.relative('', p);

  let pathToCreate = '';
  p.split(path.sep).forEach(dirName => {
    pathToCreate = path.join(pathToCreate, dirName);
    if (!fs.existsSync(pathToCreate)) {
      fs.mkdirSync(pathToCreate);
    }
  });
}
