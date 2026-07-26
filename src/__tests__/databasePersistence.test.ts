import fs from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => 'database-persistence-test-app',
    getPath: () => 'database-persistence-test-data',
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    renameSync: vi.fn(),
    writeFileSync: vi.fn(),
    openSync: vi.fn(() => 1),
    fsyncSync: vi.fn(),
    closeSync: vi.fn(),
  },
}));

import { closeDb, initDb, run, saveDb } from '../main/database';

describe('database persistence', () => {
  afterEach(() => {
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
    closeDb();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('cancels a pending autosave before an explicit save fails', async () => {
    await initDb();
    vi.useFakeTimers();
    vi.mocked(fs.writeFileSync).mockClear();
    const saveError = new Error('filesystem unavailable');

    run('CREATE TABLE close_recovery_test (id INTEGER)');
    expect(vi.getTimerCount()).toBe(1);

    vi.mocked(fs.writeFileSync).mockImplementationOnce(() => {
      throw saveError;
    });

    expect(() => saveDb()).toThrow(saveError);
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(500);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });
});
