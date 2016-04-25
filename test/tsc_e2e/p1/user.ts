import {msg} from 'mapped/dep';

function handle(v: any) {
  return v;
}

export function main() {
  console.log(msg);
  Promise.resolve(null)
      .then((x) => console.log(1))
      .then(handle, handle)
      .catch((e) => console.error(e));
}
