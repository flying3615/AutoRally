import { describe, expect, it, vi } from 'vitest';
import { createAppLifecycle } from '../main/appLifecycle';

function createDependencies(platform: string) {
  return {
    platform,
    quit: vi.fn(),
    unregisterShortcuts: vi.fn(),
    closeDb: vi.fn(),
  };
}

describe('app lifecycle', () => {
  it('keeps services running when all windows close on macOS', () => {
    const dependencies = createDependencies('darwin');
    const lifecycle = createAppLifecycle(dependencies);

    lifecycle.handleWindowAllClosed();

    expect(dependencies.quit).not.toHaveBeenCalled();
    expect(dependencies.unregisterShortcuts).not.toHaveBeenCalled();
    expect(dependencies.closeDb).not.toHaveBeenCalled();
  });

  it('requests quit without cleaning up when all windows close off macOS', () => {
    const dependencies = createDependencies('win32');
    const lifecycle = createAppLifecycle(dependencies);

    lifecycle.handleWindowAllClosed();

    expect(dependencies.quit).toHaveBeenCalledOnce();
    expect(dependencies.unregisterShortcuts).not.toHaveBeenCalled();
    expect(dependencies.closeDb).not.toHaveBeenCalled();
  });

  it('cleans up shortcuts and database when the app will quit', () => {
    const dependencies = createDependencies('linux');
    const lifecycle = createAppLifecycle(dependencies);

    lifecycle.handleWillQuit();

    expect(dependencies.unregisterShortcuts).toHaveBeenCalledOnce();
    expect(dependencies.closeDb).toHaveBeenCalledOnce();
  });

  it('cleans up shortcuts and database when a Windows session ends', () => {
    const dependencies = createDependencies('win32');
    const lifecycle = createAppLifecycle(dependencies);

    lifecycle.handleSessionEnd();

    expect(dependencies.unregisterShortcuts).toHaveBeenCalledOnce();
    expect(dependencies.closeDb).toHaveBeenCalledOnce();
  });

  it('cleans up only once when session end is followed by will quit', () => {
    const dependencies = createDependencies('win32');
    const lifecycle = createAppLifecycle(dependencies);

    lifecycle.handleSessionEnd();
    lifecycle.handleWillQuit();

    expect(dependencies.unregisterShortcuts).toHaveBeenCalledOnce();
    expect(dependencies.closeDb).toHaveBeenCalledOnce();
  });
});
