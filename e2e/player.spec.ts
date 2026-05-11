import { test, expect, addPlayer, navigateTo } from './helpers';

test.describe('球员管理', () => {
  test('添加球员后列表中可见', async ({ page }) => {
    await addPlayer(page, '张三', 'male', 4);
    await navigateTo(page, '/players');
    await page.waitForTimeout(300);

    await expect(page.getByText('张三')).toBeVisible();
  });

  test('添加多个球员均可见', async ({ page }) => {
    await addPlayer(page, '李四', 'male', 3);
    await addPlayer(page, '王五', 'female', 5);
    await addPlayer(page, '赵六', 'female', 2);

    await navigateTo(page, '/players');
    await page.waitForTimeout(300);

    await expect(page.getByText('李四')).toBeVisible();
    await expect(page.getByText('王五')).toBeVisible();
    await expect(page.getByText('赵六')).toBeVisible();
  });
});
