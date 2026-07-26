import fs from 'fs';
import path from 'path';

export type AtomicFileSystem = Pick<
  typeof fs,
  'writeFileSync' | 'openSync' | 'fsyncSync' | 'closeSync' | 'renameSync'
>;

function flushPath(filePath: string, filesystem: AtomicFileSystem) {
  const descriptor = filesystem.openSync(filePath, 'r');
  try {
    filesystem.fsyncSync(descriptor);
  } finally {
    filesystem.closeSync(descriptor);
  }
}

export function atomicWriteFile(
  filePath: string,
  data: Uint8Array,
  filesystem: AtomicFileSystem = fs,
) {
  const temporaryPath = `${filePath}.tmp`;
  filesystem.writeFileSync(temporaryPath, data);
  flushPath(temporaryPath, filesystem);
  filesystem.renameSync(temporaryPath, filePath);

  if (process.platform !== 'win32') {
    flushPath(path.dirname(filePath), filesystem);
  }
}
