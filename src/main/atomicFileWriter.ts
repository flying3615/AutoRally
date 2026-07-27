import fs from 'fs';
import path from 'path';

export type AtomicFileSystem = Pick<
  typeof fs,
  'writeFileSync' | 'openSync' | 'fsyncSync' | 'closeSync' | 'renameSync'
>;

function flushPath(filePath: string, filesystem: AtomicFileSystem, mode: string) {
  const descriptor = filesystem.openSync(filePath, mode);
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
  // Windows' FlushFileBuffers (what fsync maps to there) requires a handle
  // opened with write access — a read-only handle throws EPERM. POSIX fsync
  // works fine read-only, which the directory flush below also relies on
  // (you can't open a directory for writing at all).
  flushPath(temporaryPath, filesystem, process.platform === 'win32' ? 'r+' : 'r');
  filesystem.renameSync(temporaryPath, filePath);

  if (process.platform !== 'win32') {
    flushPath(path.dirname(filePath), filesystem, 'r');
  }
}
