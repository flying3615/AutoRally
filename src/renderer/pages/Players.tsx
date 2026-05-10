import { useEffect, useState } from 'react';

interface PlayerWithBalance {
  id: string;
  name: string;
  gender: string;
  level: number;
  phone: string;
  joinDate: string;
  balance: number;
}

export function Players() {
  const [players, setPlayers] = useState<PlayerWithBalance[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', gender: 'male', level: 3, phone: '' });
  const [topupPlayer, setTopupPlayer] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState('');

  const load = () => window.api.playersList().then((p: PlayerWithBalance[]) => setPlayers(p));
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editingId) {
      await window.api.playersUpdate(editingId, form);
    } else {
      await window.api.playersCreate(form);
    }
    setForm({ name: '', gender: 'male', level: 3, phone: '' });
    setEditingId(null);
    setShowForm(false);
    load();
  };

  const handleEdit = (p: PlayerWithBalance) => {
    setForm({ name: p.name, gender: p.gender, level: p.level, phone: p.phone });
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确认删除该球员？')) {
      await window.api.playersDelete(id);
      load();
    }
  };

  const handleTopup = async () => {
    if (!topupPlayer || !topupAmount || Number(topupAmount) <= 0) return;
    await window.api.paymentsTopup(topupPlayer, Number(topupAmount));
    setTopupPlayer(null);
    setTopupAmount('');
    load();
  };

  const levelLabels = ['', '入门', '初级', '中级', '高级', '精英'];

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">球员管理</h2>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', gender: 'male', level: 3, phone: '' }); }}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          添加球员
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">{editingId ? '编辑球员' : '添加球员'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">姓名</label>
              <input
                type="text" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">性别</label>
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="male">男</option>
                <option value="female">女</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">水平 (1-5)</label>
              <select
                value={form.level}
                onChange={(e) => setForm({ ...form, level: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {[1, 2, 3, 4, 5].map(l => (
                  <option key={l} value={l}>{l} - {levelLabels[l]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">电话</label>
              <input
                type="text" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
              {editingId ? '保存' : '添加'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200">
              取消
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-500">姓名</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">性别</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">水平</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">电话</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">余额</th>
              <th className="text-right px-6 py-3 font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-6 py-3 font-medium">{p.name}</td>
                <td className="px-6 py-3">{p.gender === 'male' ? '男' : '女'}</td>
                <td className="px-6 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    p.level >= 4 ? 'bg-orange-100 text-orange-700' : p.level >= 3 ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {p.level} - {levelLabels[p.level]}
                  </span>
                </td>
                <td className="px-6 py-3 text-gray-500">{p.phone || '-'}</td>
                <td className="px-6 py-3">
                  <span className={p.balance < 30 ? 'text-red-600 font-medium' : 'text-gray-900'}>
                    ¥{p.balance.toFixed(0)}
                  </span>
                </td>
                <td className="px-6 py-3 text-right">
                  <button onClick={() => setTopupPlayer(p.id)} className="text-green-600 hover:underline text-xs mr-3">充值</button>
                  <button onClick={() => handleEdit(p)} className="text-blue-600 hover:underline text-xs mr-3">编辑</button>
                  <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:underline text-xs">删除</button>
                </td>
              </tr>
            ))}
            {players.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">暂无球员，点击上方按钮添加</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Topup Modal */}
      {topupPlayer && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-80">
            <h3 className="text-lg font-semibold mb-4">充值</h3>
            <input
              type="number" value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              placeholder="充值金额"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-3">
              <button onClick={handleTopup} className="flex-1 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">确认充值</button>
              <button onClick={() => setTopupPlayer(null)} className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
