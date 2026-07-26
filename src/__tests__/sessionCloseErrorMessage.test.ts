import { describe, expect, it } from 'vitest';
import { sessionCloseErrorMessage } from '../main/sessionCloseErrorMessage';

describe('sessionCloseErrorMessage', () => {
  it('never exposes Unix or Windows error-path details in the close dialog', () => {
    const unixPath = '/Users/Alice/My Data/db.sqlite';
    const windowsPath = 'C:\\Users\\Alice\\My Data\\db.sqlite';
    const unixMessage = `Unable to save database at ${unixPath}`;
    const windowsMessage = `Unable to save database at ${windowsPath}`;

    for (const error of [new Error(unixMessage), new Error(windowsMessage)]) {
      const message = sessionCloseErrorMessage(error);

      expect(message).toBe('当前会话未结束，程序将保持打开。您可以稍后重试。');
      for (const leakedValue of [unixPath, windowsPath, 'Users', 'Alice', 'My Data', 'db.sqlite']) {
        expect(message).not.toContain(leakedValue);
      }
    }
  });
});
