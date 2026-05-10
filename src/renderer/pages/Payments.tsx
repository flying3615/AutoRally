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
  phone?: string;
}

export function Payments() {
  const [unpaid, setUnpaid] = useState<PaymentInfo[]>([]);
  const [tab, setTab] = useState<'unpaid' | 'all'>('unpaid');

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
    if (!confirm('确认将所有未缴费标记为已缴？')) return;
    for (const p of unpaid) {
      await window.api.paymentsMarkPaid(p.id);
    }
    load();
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">会费管理</h2>
        <div className="flex gap-3">
          <button
            onClick={() => setTab('unpaid')}
            className={`px-4 py-2 text-sm rounded-lg ${tab === 'unpaid' ? 'bg-red-100 text-red-700 font-medium' : 'bg-gray-100 text-gray-600'}`}
          >
            未缴费 ({unpaid.length})
          </button>
          <button
            onClick={() => setTab('all')}
            className={`px-4 py-2 text-sm rounded-lg ${tab === 'all' ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-gray-100 text-gray-600'}`}
          >
            全部
          </button>
          {unpaid.length > 0 && (
            <button
              onClick={handleMarkAllPaid}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
            >
              全部标记已缴
            </button>
          )}
        </div>
      </div>

      {tab === 'unpaid' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-500">球员</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">金额</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {unpaid.map(p => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium">{p.playerName}</td>
                  <td className="px-6 py-3 text-red-600 font-medium">¥{p.amount}</td>
                  <td className="px-6 py-3">
                    <button
                      onClick={() => handleMarkPaid(p.id)}
                      className="text-green-600 hover:underline text-xs"
                    >
                      标记已缴
                    </button>
                  </td>
                </tr>
              ))}
              {unpaid.length === 0 && (
                <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-400">所有会费已缴清</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'all' && (
        <p className="text-gray-500 text-sm">查看球员管理页面的余额信息，或前往具体 Session 查看缴费明细。</p>
      )}
    </div>
  );
}
