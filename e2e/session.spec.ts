import { test, expect, createSession, getActiveSession } from './helpers';

test.describe('Session Management', () => {
  test('creates session and returns it', async ({ page }) => {
    const session = await createSession(page, 4) as { id: string; status: string; courtCount: number };
    expect(session).toBeDefined();
    expect(session.status).toBe('active');
    expect(session.courtCount).toBe(4);
  });

  test('getActive returns the active session', async ({ page }) => {
    await createSession(page, 4);
    const active = await getActiveSession(page) as { id: string; status: string } | undefined;
    expect(active).toBeDefined();
    expect(active!.status).toBe('active');
  });

  test('getActive returns undefined after ending session', async ({ page }) => {
    const session = await createSession(page, 4) as { id: string };
    await page.evaluate(
      (id) => window.api.sessionsEnd(id),
      session.id
    );
    const active = await getActiveSession(page);
    expect(active).toBeUndefined();
  });
});
