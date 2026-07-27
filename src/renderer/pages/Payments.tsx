import { useEffect, useState } from 'react';
import { toast } from '../stores/toastStore';

interface PaymentInfo {
  id: string;
  playerId: string;
  sessionId: string | null;
  playerName: string;
  amount: number;
  status: string;
  paidDate: string | null;
  paymentType: string;
  gender?: string;
  level?: number;
}

interface SessionSummary {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  courtCount: number;
  status: string;
}

interface AttendanceRecord {
  id: string;
  playerId: string;
  name: string;
}

// ── Per-session row: who played and who paid, loaded on expand ──
function SessionPaymentsRow({ session }: { session: SessionSummary }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRecord[] | null>(null);
  const [payments, setPayments] = useState<PaymentInfo[] | null>(null);

  const toggle = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (payments !== null) return;

    setLoading(true);
    try {
      const [att, pays] = await Promise.all([
        window.api.attendanceListBySession(session.id) as Promise<AttendanceRecord[]>,
        window.api.paymentsListBySession(session.id) as Promise<PaymentInfo[]>,
      ]);
      setAttendance(att);
      setPayments(pays);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load session payment records');
    } finally {
      setLoading(false);
    }
  };

  const paidTotal = (payments ?? []).filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
  const unpaidTotal = (payments ?? []).filter(p => p.status !== 'paid').reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="bg-white border border-zinc-200/80 rounded-2xl overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-zinc-50/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-zinc-900 tabular-nums">{session.date}</span>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
            session.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
          }`}>
            {session.status === 'active' ? 'Active' : 'Ended'}
          </span>
          <span className="text-xs text-zinc-400">{session.courtCount} courts</span>
        </div>
        <div className="flex items-center gap-3">
          {payments && (
            <>
              <span className="text-xs font-semibold text-emerald-600 tabular-nums">${paidTotal.toFixed(0)} paid</span>
              {unpaidTotal > 0 && (
                <span className="text-xs font-semibold text-red-500 tabular-nums">${unpaidTotal.toFixed(0)} unpaid</span>
              )}
            </>
          )}
          <svg
            className={`w-4 h-4 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 px-5 py-3">
          {loading ? (
            <div className="py-3 text-xs text-zinc-400">Loading…</div>
          ) : (attendance ?? []).length === 0 ? (
            <p className="py-2 text-xs text-zinc-400">No players checked in</p>
          ) : (
            <div className="divide-y divide-zinc-50">
              {(attendance ?? []).map(a => {
                const payment = (payments ?? []).find(p => p.playerId === a.playerId);
                return (
                  <div key={a.id} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-zinc-700">{a.name}</span>
                    {payment ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs tabular-nums text-zinc-500">${payment.amount}</span>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                          payment.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                        }`}>
                          {payment.status === 'paid' ? 'Paid' : 'Unpaid'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-zinc-300">No payment record</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Payments() {
  const [unpaid, setUnpaid] = useState<PaymentInfo[]>([]);
  const [tab, setTab] = useState<'unpaid' | 'all'>('unpaid');
  const [isMarking, setIsMarking] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);

  const load = async () => {
    const unpaidList = await window.api.paymentsListUnpaid();
    setUnpaid(unpaidList as PaymentInfo[]);
  };

  useEffect(() => { load(); }, []);

  // Lazy-load the session list only once the "All Records" tab is opened —
  // includes every session (active, ended, and historical) until it's been
  // removed via "Clear historical data".
  useEffect(() => {
    if (tab !== 'all' || sessions !== null) return;
    window.api.sessionsList().then(list => setSessions(list as SessionSummary[]));
  }, [tab, sessions]);

  const handleMarkPaid = async (id: string) => {
    await window.api.paymentsMarkPaid(id);
    load();
  };

  const handleMarkAllPaid = async () => {
    if (isMarking) return;
    setIsMarking(true);
    try {
      for (const p of unpaid) {
        await window.api.paymentsMarkPaid(p.id);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark payments as paid');
    } finally {
      setIsMarking(false);
      load();
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-[90%] mx-auto px-8 py-10" style={{ animation: 'fadeIn 0.3s ease' }}>

        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <p className="text-sm text-zinc-400">Track unpaid records and balance changes</p>
          <div className="flex items-center gap-2">
            {unpaid.length > 0 && (
              <button
                onClick={handleMarkAllPaid}
                disabled={isMarking}
                className="h-8 px-3.5 text-sm font-medium bg-emerald-600 text-white rounded-lg
                  hover:bg-emerald-500 active:scale-[0.97] shadow-[0_2px_8px_-2px_rgba(5,150,105,0.3)]
                  transition-all inline-flex items-center justify-center gap-1.5
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Mark All Paid
              </button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 p-1 bg-zinc-100/80 rounded-xl w-fit">
          <button
            onClick={() => setTab('unpaid')}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 ${
              tab === 'unpaid'
                ? 'bg-white text-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Unpaid
            {unpaid.length > 0 && (
              <span className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                tab === 'unpaid' ? 'bg-red-50 text-red-600' : 'bg-red-50 text-red-600'
              }`}>
                {unpaid.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('all')}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 ${
              tab === 'all'
                ? 'bg-white text-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            All Records
          </button>
        </div>

        {/* Unpaid tab */}
        {tab === 'unpaid' && (
          <>
            {unpaid.length > 0 ? (
              <div className="space-y-2">
                {unpaid.map(p => {
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-4 px-5 py-3.5 bg-white border border-zinc-200/80 rounded-2xl
                        hover:border-zinc-300 hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.06)] transition-all duration-200 group"
                    >
                      {/* Avatar */}
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: '#ef4444' }}
                      >
                        {p.playerName[0]}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 truncate">{p.playerName}</p>
                        <p className="text-xs text-zinc-400 mt-0.5 font-medium">
                          {p.paymentType === 'session' ? 'Session Fee' : 'Top Up'}
                        </p>
                      </div>

                      {/* Amount */}
                      <div className="text-right shrink-0">
                        <p className="text-base font-bold text-red-500 tabular-nums">
                          ${p.amount}
                        </p>
                        <p className="text-[11px] text-zinc-400 font-medium">Unpaid</p>
                      </div>

                      {/* Action */}
                      <button
                        onClick={() => handleMarkPaid(p.id)}
                        className="shrink-0 h-8 px-3 text-xs font-semibold text-emerald-600 bg-emerald-50
                          rounded-lg hover:bg-emerald-100 active:scale-95 transition-all
                          opacity-0 group-hover:opacity-100"
                      >
                        Mark Paid
                      </button>
                    </div>
                  );
                })}

                {/* Summary bar */}
                <div className="flex items-center justify-between px-5 py-3 mt-4 rounded-2xl bg-red-50/70 border border-red-100/80">
                  <span className="text-sm text-red-700 font-medium">
                    {unpaid.length} players unpaid
                  </span>
                  <span className="text-lg font-bold text-red-600 tabular-nums">
                    ${unpaid.reduce((sum, p) => sum + p.amount, 0).toFixed(0)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-zinc-400">
                <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center mb-4 border border-zinc-100">
                  <svg className="w-6 h-6 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-zinc-500">All fees are paid</p>
                <p className="text-xs mt-1 text-zinc-400">No pending payment records</p>
              </div>
            )}
          </>
        )}

        {/* All tab — per-session record of who played and who paid */}
        {tab === 'all' && (
          sessions === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => <div key={i} className="h-14 skeleton rounded-2xl" />)}
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-zinc-400">
              <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center mb-4 border border-zinc-100">
                <svg className="w-6 h-6 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-zinc-500">No sessions yet</p>
              <p className="text-xs mt-1 text-zinc-400">Payment records appear here once a session runs</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map(s => <SessionPaymentsRow key={s.id} session={s} />)}
            </div>
          )
        )}
      </div>
    </div>
  );
}
