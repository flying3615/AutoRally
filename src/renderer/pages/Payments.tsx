import { useEffect, useState } from 'react';

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

export function Payments() {
  const [unpaid, setUnpaid] = useState<PaymentInfo[]>([]);
  const [tab, setTab] = useState<'unpaid' | 'all'>('unpaid');
  const [isMarking, setIsMarking] = useState(false);
  const totalUnpaid = unpaid.reduce((sum, p) => sum + p.amount, 0);

  const load = async () => {
    const unpaidList = await window.api.paymentsListUnpaid();
    setUnpaid(unpaidList as PaymentInfo[]);
  };

  useEffect(() => { load(); }, []);

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
      alert(err instanceof Error ? err.message : 'Failed to mark payments as paid');
    } finally {
      setIsMarking(false);
      load();
    }
  };

  return (
    <div className="ar-page">
      <div className="ar-page-inner">

        {/* Header */}
        <div className="ar-page-header">
          <div>
            <h1 className="ar-page-title">Payments</h1>
            <p className="ar-page-copy">Track unpaid records and settle session fees quickly.</p>
          </div>
          <div className="ar-toolbar !mb-0">
            {unpaid.length > 0 && (
              <button
                onClick={handleMarkAllPaid}
                disabled={isMarking}
                className="ar-accent-button"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Mark All Paid
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="ar-stat-card">
            <p className="ar-stat-label">Unpaid players</p>
            <p className="ar-stat-value">{unpaid.length}</p>
          </div>
          <div className="ar-stat-card">
            <p className="ar-stat-label">Outstanding</p>
            <p className="ar-stat-value !text-red-500">${totalUnpaid.toFixed(0)}</p>
          </div>
          <div className="ar-stat-card">
            <p className="ar-stat-label">Payment queue</p>
            <p className="ar-stat-value !text-2xl">{unpaid.length > 0 ? 'Open' : 'Clear'}</p>
            <p className="ar-stat-meta">{unpaid.length > 0 ? 'Action needed' : 'No pending fees'}</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="ar-segment mb-6">
          <button
            onClick={() => setTab('unpaid')}
            data-active={tab === 'unpaid'}
            className="ar-segment-button"
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
            data-active={tab === 'all'}
            className="ar-segment-button"
          >
            All Records
          </button>
        </div>

        {/* Unpaid tab */}
        {tab === 'unpaid' && (
          <>
            {unpaid.length > 0 ? (
              <div className="ar-card overflow-hidden divide-y divide-zinc-100/80">
                {unpaid.map(p => {
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-4 px-5 py-3.5 bg-white hover:bg-zinc-50/70 transition-all duration-200 group"
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
                        className="shrink-0 h-8 px-3 text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 active:scale-95 transition-all opacity-0 group-hover:opacity-100"
                      >
                        Mark Paid
                      </button>
                    </div>
                  );
                })}
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

        {/* All tab */}
        {tab === 'all' && (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-400">
            <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center mb-4 border border-zinc-100">
              <svg className="w-6 h-6 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-zinc-500">Payment details</p>
            <p className="text-xs mt-1 text-zinc-400">Check player balances or session details</p>
          </div>
        )}
      </div>
    </div>
  );
}
