// The public Worker never opens a local store or reads the private play files.
export function existsSync() {
  return false;
}
export function readFileSync(): never {
  throw Error("local_files_disabled");
}
export const mkdirSync = readFileSync;
export const writeFileSync = readFileSync;
export const renameSync = readFileSync;
