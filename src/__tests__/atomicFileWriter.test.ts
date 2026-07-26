import { describe, expect, it } from 'vitest';
import { atomicWriteFile, type AtomicFileSystem } from '../main/atomicFileWriter';

describe('atomicWriteFile', () => {
  it('flushes the temporary file before rename and the parent directory after rename', () => {
    const calls: string[] = [];
    const tempFd = 10;
    const directoryFd = 11;
    const filesystem: AtomicFileSystem = {
      writeFileSync(filePath) {
        calls.push(`write:${filePath}`);
      },
      openSync(filePath) {
        calls.push(`open:${filePath}`);
        return filePath === '/data/autorally.db.tmp' ? tempFd : directoryFd;
      },
      fsyncSync(fd) {
        calls.push(`fsync:${fd}`);
      },
      closeSync(fd) {
        calls.push(`close:${fd}`);
      },
      renameSync(oldPath, newPath) {
        calls.push(`rename:${oldPath}:${newPath}`);
      },
    };

    atomicWriteFile('/data/autorally.db', Buffer.from('database'), filesystem);

    expect(calls).toEqual([
      'write:/data/autorally.db.tmp',
      'open:/data/autorally.db.tmp',
      'fsync:10',
      'close:10',
      'rename:/data/autorally.db.tmp:/data/autorally.db',
      'open:/data',
      'fsync:11',
      'close:11',
    ]);
  });
});
