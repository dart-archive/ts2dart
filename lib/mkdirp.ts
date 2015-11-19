import * as fs from 'fs';
import * as path from 'path';


export default function mkdirP(p: string) {
  let absPath = process.cwd();

  p.split(path.sep).forEach(dirName => {
    absPath = path.join(absPath, dirName);
    if (!fs.existsSync(absPath)) {
      fs.mkdir(absPath);
    }
  })
}

