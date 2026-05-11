import { useEffect, useState } from 'react';

interface SettingsData {
  courtCount: string;
  sessionFee: string;
  gameDuration: string;
}

const durations = [
  { value: '10', label: '10 min' },
  { value: '12', label: '12 min' },
  { value: '15', label: '15 min' },
  { value: '20', label: '20 min' },
  { value: '25', label: '25 min' },
  { value: '30', label: '30 min' },
];

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
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-10" style={{ animation: 'fadeIn 0.3s ease' }}>

        {/* Header */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Settings</h2>
          <p className="text-sm text-zinc-400 mt-0.5">Match parameters and fee configuration</p>
        </div>

        {/* Court Count */}
        <div className="mb-8">
          <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Court Count</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                onClick={() => setSettings({ ...settings, courtCount: String(n) })}
                className={`flex-1 py-3 text-sm font-semibold rounded-xl border-2 transition-all duration-150 active:scale-95 ${
                  settings.courtCount === String(n)
                    ? 'bg-zinc-900 border-zinc-900 text-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2)]'
                    : 'bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                {n}
              </button>
            ))}
            <div className="flex items-center gap-2 flex-1 min-w-[120px]">
              <input
                type="number"
                min="1"
                max="20"
                value={![1,2,3,4,5,6].includes(Number(settings.courtCount)) ? settings.courtCount : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') return;
                  setSettings({ ...settings, courtCount: v });
                }}
                placeholder="Custom"
                className="w-full py-3 px-3 text-sm font-semibold text-center border-2 border-zinc-200 rounded-xl
                  focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all
                  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>
          <p className="text-xs text-zinc-400 mt-2.5">Number of concurrent matches</p>
        </div>

        {/* Game Duration */}
        <div className="mb-8">
          <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Game Duration</label>
          <div className="grid grid-cols-3 gap-2">
            {durations.map(d => (
              <button
                key={d.value}
                onClick={() => setSettings({ ...settings, gameDuration: d.value })}
                className={`py-3 text-sm font-medium rounded-xl border-2 transition-all duration-150 active:scale-95 ${
                  settings.gameDuration === d.value
                    ? 'bg-zinc-900 border-zinc-900 text-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2)]'
                    : 'bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                {d.label}
              </button>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="120"
                value={!['10','12','15','20','25','30'].includes(settings.gameDuration) ? settings.gameDuration : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') return;
                  setSettings({ ...settings, gameDuration: v });
                }}
                placeholder="Custom (min)"
                className="w-full py-3 px-3 text-sm font-medium text-center border-2 border-zinc-200 rounded-xl
                  focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all
                  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>
          <p className="text-xs text-zinc-400 mt-2.5">Auto-warning and next round scheduling 1 min before end</p>
        </div>

        {/* Session Fee */}
        <div className="mb-10">
          <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Session Fee</label>
          <div className="relative">
            <input
              type="number"
              value={settings.sessionFee}
              onChange={(e) => setSettings({ ...settings, sessionFee: e.target.value })}
              className="w-full px-4 py-3 text-lg font-bold text-zinc-900 border-2 border-zinc-200 rounded-xl
                focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-zinc-400">NZD / person</span>
          </div>
          <p className="text-xs text-zinc-400 mt-2.5">Auto-deducted from balance on check-in</p>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="h-10 px-6 text-sm font-semibold bg-zinc-900 text-white rounded-xl
              hover:bg-zinc-800 active:scale-[0.97] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2)] transition-all inline-flex items-center justify-center"
          >
            Save Settings
          </button>
          {saved && (
            <span
              className="text-sm font-semibold text-emerald-600"
              style={{ animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
              Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
