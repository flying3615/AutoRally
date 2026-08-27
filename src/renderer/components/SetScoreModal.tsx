import { useMemo, useState } from 'react';
import { isValidBadmintonSetScore } from '../../shared/badminton';

export interface SetScoreModalProps {
  title: string;
  team1Label: string;
  team2Label: string;
  matchLabel?: string;
  initialSets?: { team1: number; team2: number }[];
  onCancel: () => void;
  onSave: (sets: { team1: number; team2: number }[]) => Promise<void>;
}

interface SetInput {
  team1: string;
  team2: string;
}

function winnerOf(set: SetInput): 'team1' | 'team2' | null {
  if (set.team1 === '' || set.team2 === '') return null;
  const a = Number(set.team1);
  const b = Number(set.team2);
  if (!isValidBadmintonSetScore(a, b)) return null;
  return a > b ? 'team1' : 'team2';
}

function isFilledButInvalid(set: SetInput): boolean {
  if (set.team1 === '' || set.team2 === '') return false;
  return winnerOf(set) === null;
}

export function SetScoreModal({ title, team1Label, team2Label, matchLabel, initialSets, onCancel, onSave }: SetScoreModalProps) {
  const [sets, setSets] = useState<SetInput[]>(() => (
    [0, 1, 2].map(i => {
      const s = initialSets?.[i];
      return { team1: s ? String(s.team1) : '', team2: s ? String(s.team2) : '' };
    })
  ));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set1 = sets[0]!;
  const set2 = sets[1]!;
  const set3 = sets[2]!;
  const set1Winner = winnerOf(set1);
  const set2Winner = winnerOf(set2);
  const needsThird = set1Winner !== null && set2Winner !== null && set1Winner !== set2Winner;
  const set3Winner = needsThird ? winnerOf(set3) : null;

  const tally = useMemo(() => {
    const winners = [set1Winner, set2Winner, set3Winner];
    return {
      team1: winners.filter(w => w === 'team1').length,
      team2: winners.filter(w => w === 'team2').length,
    };
  }, [set1Winner, set2Winner, set3Winner]);

  const canSave = set1Winner !== null && set2Winner !== null && (!needsThird || set3Winner !== null);

  const updateSet = (index: number, side: 'team1' | 'team2', value: string) => {
    setSets(prev => prev.map((s, i) => (i === index ? { ...s, [side]: value } : s)));
  };

  const handleSave = async () => {
    if (!canSave) return;
    setError(null);
    const active = (needsThird ? [set1, set2, set3] : [set1, set2]).map(s => ({ team1: Number(s.team1), team2: Number(s.team2) }));
    setSaving(true);
    try {
      await onSave(active);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save score.');
    } finally {
      setSaving(false);
    }
  };

  const rows = needsThird ? [0, 1, 2] : [0, 1];

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl p-6 w-[420px] max-w-[90vw]"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter') handleSave(); }}
      >
        <h3 className="text-lg font-bold text-zinc-900 mb-1">{title}</h3>
        <p className="text-xs text-zinc-400 mb-4">
          {team1Label} vs {team2Label}
          {matchLabel && <span className="ml-2">· {matchLabel}</span>}
          {(set1Winner !== null || set2Winner !== null) && (
            <span className="ml-2 font-semibold text-zinc-500">({tally.team1}-{tally.team2} in sets)</span>
          )}
        </p>

        <div className="space-y-3 mb-4">
          {rows.map(i => {
            const set = sets[i]!;
            const invalid = isFilledButInvalid(set);
            return (
              <div key={i}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-zinc-400 w-12 shrink-0">Set {i + 1}</span>
                  <input
                    autoFocus={i === 0}
                    type="number" min="0"
                    value={set.team1}
                    onChange={e => updateSet(i, 'team1', e.target.value)}
                    className="w-16 px-3 py-2 text-sm font-mono text-center border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400"
                  />
                  <span className="text-zinc-400 font-bold text-sm">vs</span>
                  <input
                    type="number" min="0"
                    value={set.team2}
                    onChange={e => updateSet(i, 'team2', e.target.value)}
                    className="w-16 px-3 py-2 text-sm font-mono text-center border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400"
                  />
                </div>
                {invalid && (
                  <p className="text-[11px] text-red-600 mt-1 ml-[60px]">Not a valid badminton set score.</p>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="mb-3 text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 rounded-xl">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="px-5 py-2 text-sm font-semibold bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 active:scale-[0.97] transition-all disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save Score'}
          </button>
        </div>
      </div>
    </div>
  );
}
