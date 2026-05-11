import { test, expect, createSession, getActiveSession } from './helpers';

test.describe('Session 管理', () => {
  test('创建 Session 后可查询到', async ({ page }) => {
    const session = await createSession(page, 3) as { id: string; status: string; courtCount: number };
    expect(session).toBeDefined();
    expect(session.status).toBe('active');
    expect(session.courtCount).toBe(3);
  });

  test('创建 Session 后 getActive 返回该 Session', async ({ page }) => {
    await createSession(page, 3);
    const active = await getActiveSession(page) as { id: string; status: string } | undefined;
    expect(active).toBeDefined();
    expect(active!.status).toBe('active');
  });

  test('结束 Session 后 getActive 返回 undefined', async ({ page }) => {
    const session = await createSession(page, 3) as { id: string };
    await page.evaluate(
      (id) => window.api.sessionsEnd(id),
      session.id
    );
    const active = await getActiveSession(page);
    expect(active).toBeUndefined();
  });
});
