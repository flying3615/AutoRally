import { useEffect, useState } from 'react';

interface SettingsData {
  courtCount: string;
  sessionFee: string;
  gameDuration: string;
}

export function Settings() {
  const [settings, setSettings] = useState<SettingsData>({ courtCount: '3', sessionFee: '30', gameDuration: '15' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.api.settingsGetAll().then((s: Record<string, string>) => {
      setSettings({
        courtCount: s.courtCount ?? '3',
        sessionFee: s.sessionFee ?? '30',
        gameDuration: s.gameDuration ?? '15',
      });
    });
  }, []);

  const handleSave = async () => {
    await window.api.settingsSet('courtCount', settings.courtCount);
    await window.api.settingsSet('sessionFee', settings.sessionFee);
    await window.api.settingsSet('gameDuration', settings.gameDuration);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-8 max-w-3xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">设置</h2>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">场地数</label>
          <select
            value={settings.courtCount}
            onChange={(e) => setSettings({ ...settings, courtCount: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} 片</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">每次 Session 费用 (元)</label>
          <input
            type="number" value={settings.sessionFee}
            onChange={(e) => setSettings({ ...settings, sessionFee: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">每场比赛时长 (分钟)</label>
          <input
            type="number" value={settings.gameDuration}
            onChange={(e) => setSettings({ ...settings, gameDuration: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            保存
          </button>
          {saved && <span className="text-green-600 text-sm">已保存</span>}
        </div>
      </div>
    </div>
  );
}
