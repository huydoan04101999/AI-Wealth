import React, { useState, useEffect } from 'react';
import { Plus, Database, AlertCircle, TrendingUp, ArrowDownRight, ArrowUpRight, Edit2, Trash2, Calendar, X, History, ShieldCheck, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';
import { formatCurrency, parseInputNumber } from '../lib/format';
import { useAuth } from '../contexts/AuthContext';

interface Transaction {
  id: number;
  asset_type: string;
  asset_symbol: string;
  transaction_type: string;
  amount: string;
  price_per_unit: string;
  interest_rate?: string;
  date: string;
  currency: string;
}

interface AssetDefinition {
  id: number;
  category: string;
  name: string;
  symbol: string;
  current_price: string;
  updated_at: string;
}

export default function Portfolio() {
  const { currency, exchangeRate } = useStore();
  const { fetchApi } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [assetDefinitions, setAssetDefinitions] = useState<AssetDefinition[]>([]);
  const [marketPrices, setMarketPrices] = useState<Record<string, { usd: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Asset Management state
  const [isManagingAssets, setIsManagingAssets] = useState(false);
  const [newAsset, setNewAsset] = useState({ category: 'gold', name: '', current_price: '' });
  const [editingAssetId, setEditingAssetId] = useState<number | null>(null);
  const [isSavingAsset, setIsSavingAsset] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    asset_type: 'crypto',
    asset_symbol: 'BTC',
    transaction_type: 'buy',
    amount: '',
    price_per_unit: '',
    interest_rate: '',
    date: new Date().toISOString().split('T')[0],
    currency: 'USD' // Default to USD for BTC
  });

  const fetchAssetDefinitions = async () => {
    try {
      const res = await fetchApi('/api/portfolio/assets');
      if (res.ok) {
        const data = await res.json();
        setAssetDefinitions(data);
      }
    } catch (err) {
      console.error("Error fetching asset definitions:", err);
    }
  };

  const fetchPrices = async () => {
    try {
      // Fetch BTC price
      const btcRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
      if (btcRes.ok) {
        const data = await btcRes.json();
        setMarketPrices(prev => ({ ...prev, 'BTC': { usd: data.bitcoin.usd } }));
      }
    } catch (err) {
      console.error("Error fetching prices:", err);
    }
  };

  const fetchTransactions = async () => {
    try {
      const res = await fetchApi('/api/portfolio/transactions');
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch data');
      }
      
      setTransactions(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
    fetchAssetDefinitions();
    fetchPrices();
    const interval = setInterval(() => {
      fetchPrices();
      fetchAssetDefinitions();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAsset.name || !newAsset.current_price) return;
    setIsSavingAsset(true);
    try {
      const url = editingAssetId 
        ? `/api/portfolio/assets/${editingAssetId}` 
        : '/api/portfolio/assets';
      const method = editingAssetId ? 'PUT' : 'POST';

      const parsedPrice = parseFloat(parseInputNumber(newAsset.current_price));
      // Convert to USD before saving if input was in VND
      const priceInUsd = currency === 'VND' ? parsedPrice / exchangeRate : parsedPrice;

      const res = await fetchApi(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newAsset, current_price: priceInUsd })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save asset');
      
      setNewAsset({ ...newAsset, name: '', current_price: '' });
      setEditingAssetId(null);
      fetchAssetDefinitions();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSavingAsset(false);
    }
  };

  const handleEditAsset = (asset: AssetDefinition) => {
    setEditingAssetId(asset.id);
    // Convert USD price to user's global currency for editing
    const displayPrice = currency === 'VND' 
      ? (parseFloat(asset.current_price) * exchangeRate).toString() 
      : asset.current_price;
      
    setNewAsset({
      category: asset.category,
      name: asset.name,
      current_price: displayPrice
    });
  };

  const handleDeleteAsset = async (id: number) => {
    if (!confirm('Xóa loại tài sản này sẽ ảnh hưởng đến việc hiển thị giá hiện tại của các giao dịch liên quan. Tiếp tục?')) return;
    try {
      const res = await fetchApi(`/api/portfolio/assets/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to delete asset');
      }
      fetchAssetDefinitions();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const url = editingId 
        ? `/api/portfolio/transactions/${editingId}` 
        : '/api/portfolio/transactions';
      const method = editingId ? 'PUT' : 'POST';

      const parsedAmount = parseInputNumber(formData.amount) || '0';
      const parsedPrice = formData.asset_type === 'bank' ? '1' : (parseInputNumber(formData.price_per_unit) || '0');
      const parsedInterest = formData.interest_rate ? parseInputNumber(formData.interest_rate) : '0';

      const res = await fetchApi(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...formData, 
          amount: parsedAmount,
          price_per_unit: parsedPrice,
          interest_rate: parsedInterest,
          currency: formData.currency 
        })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to save transaction');
      
      setIsAdding(false);
      setEditingId(null);
      setFormData({ 
        ...formData, 
        amount: '', 
        price_per_unit: '', 
        interest_rate: '',
        date: new Date().toISOString().split('T')[0],
        currency: formData.asset_type === 'crypto' ? 'USD' : 'VND'
      });
      fetchTransactions();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa giao dịch này?')) return;
    try {
      const res = await fetchApi(`/api/portfolio/transactions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      fetchTransactions();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setFormData({
      asset_type: tx.asset_type,
      asset_symbol: tx.asset_symbol,
      transaction_type: tx.transaction_type,
      amount: tx.amount,
      price_per_unit: tx.price_per_unit,
      interest_rate: tx.interest_rate || '',
      date: new Date(tx.date).toISOString().split('T')[0],
      currency: (tx.currency || 'USD') as 'USD' | 'VND'
    });
    setIsAdding(true);
  };

  const calculateCurrentValue = (tx: Transaction) => {
    const amount = parseFloat(tx.amount);
    const originalPrice = parseFloat(tx.price_per_unit);
    const txCurrency = tx.currency || 'USD';
    
    // Normalize base value to USD for internal calculations
    const baseValueInUsd = txCurrency === 'VND' ? (amount * originalPrice) / exchangeRate : (amount * originalPrice);

    if (tx.asset_type === 'bank' && tx.interest_rate) {
      const rate = parseFloat(tx.interest_rate) / 100;
      const startDate = new Date(tx.date);
      const now = new Date();
      const diffTime = Math.max(0, now.getTime() - startDate.getTime());
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      
      // Compound interest (daily) in USD
      return baseValueInUsd * Math.pow(1 + rate / 365, diffDays);
    }

    // Use market or custom price (already in USD) for current value
    const currentPriceInUsd = getCurrentPrice(tx.asset_symbol, tx.asset_type);
    return amount * currentPriceInUsd;
  };

  const getCurrentPrice = (symbol: string, type: string) => {
    if (type === 'bank') return 1;
    const assetDef = assetDefinitions.find(a => a.symbol === symbol);
    if (assetDef) {
      return parseFloat(assetDef.current_price);
    }
    return marketPrices[symbol]?.usd || 0;
  };

  // --- Calculate Inflation-Hedge Score ---
  // Group assets by type to calculate total value
  const assetTotals = transactions.reduce((acc, tx) => {
    const value = calculateCurrentValue(tx);
    acc[tx.asset_type] = (acc[tx.asset_type] || 0) + value;
    return acc;
  }, {} as Record<string, number>);

  const totalPortfolioValue = Object.values(assetTotals).reduce((sum, val) => sum + val, 0);

  // Calculate score based on weights
  // Bank/Cash: 1, Bonds: 3, Crypto: 8, Gold: 9, Real Estate: 10
  let inflationScore = 0;
  if (totalPortfolioValue > 0) {
    const bankWeight = (assetTotals['bank'] || 0) / totalPortfolioValue;
    const cryptoWeight = (assetTotals['crypto'] || 0) / totalPortfolioValue;
    const goldWeight = (assetTotals['gold'] || 0) / totalPortfolioValue;
    const realEstateWeight = (assetTotals['real_estate'] || 0) / totalPortfolioValue;

    // Weighted average score (0-10)
    inflationScore = (bankWeight * 1) + (cryptoWeight * 8) + (goldWeight * 9) + (realEstateWeight * 10);
  }

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-emerald-600';
    if (score >= 5) return 'text-amber-500';
    return 'text-rose-600';
  };

  const getScoreBg = (score: number) => {
    if (score >= 8) return 'bg-emerald-50 border-emerald-200';
    if (score >= 5) return 'bg-amber-50 border-amber-200';
    return 'bg-rose-50 border-rose-200';
  };

  const getScoreMessage = (score: number) => {
    if (totalPortfolioValue === 0) return 'Chưa có dữ liệu để đánh giá.';
    if (score >= 8) return 'Tuyệt vời! Danh mục của bạn có khả năng chống lạm phát rất tốt.';
    if (score >= 5) return 'Khá ổn. Tuy nhiên, bạn có thể cân nhắc tăng tỷ trọng tài sản phòng vệ.';
    return 'Rủi ro cao! Bạn đang giữ quá nhiều tiền mặt hoặc tài sản dễ mất giá khi lạm phát tăng.';
  };
  // ---------------------------------------

  if (loading) {
    return <div className="flex items-center justify-center h-full text-slate-400">Đang tải dữ liệu...</div>;
  }

  if (error === 'POSTGRES_URL is not configured.') {
    return (
      <div className="max-w-2xl mx-auto mt-20 p-10 rounded-3xl border border-rose-200 bg-white text-center space-y-6 shadow-xl">
        <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
          <Database className="w-8 h-8 text-rose-500" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Chưa kết nối Database</h2>
          <p className="text-slate-500 mt-2">
            Ứng dụng cần kết nối với Vercel Postgres để lưu trữ danh mục đầu tư.
          </p>
        </div>
        <div className="text-left bg-slate-50 p-6 rounded-2xl text-sm font-mono text-slate-700 mt-6 border border-slate-200 leading-relaxed">
          <p className="text-slate-400 mb-3 uppercase tracking-widest font-bold text-[10px]">// Hướng dẫn cấu hình:</p>
          <p>1. Tạo database Postgres trên Vercel hoặc Neon.</p>
          <p>2. Mở menu Settings (bánh răng) ở góc phải màn hình AI Studio.</p>
          <p>3. Thêm Secret mới với tên: <span className="text-emerald-600 font-bold">POSTGRES_URL</span></p>
          <p>4. Dán connection string của Vercel vào và lưu lại.</p>
          <p className="mt-6 text-slate-400 uppercase tracking-widest font-bold text-[10px]">// Kiểm tra trạng thái:</p>
          <p>Truy cập: <a href="/api/health" target="_blank" className="text-emerald-600 underline font-bold">/api/health</a></p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-20 p-10 rounded-3xl border border-rose-200 bg-white text-center space-y-6 shadow-xl">
        <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
          <AlertCircle className="w-8 h-8 text-rose-500" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Lỗi kết nối Database</h2>
          <p className="text-slate-500 mt-2">
            Có lỗi xảy ra khi kết nối tới cơ sở dữ liệu của bạn.
          </p>
        </div>
        <div className="text-left bg-rose-50 p-6 rounded-2xl text-sm font-mono text-rose-700 mt-6 border border-rose-100 overflow-x-auto leading-relaxed">
          <p className="text-rose-400 mb-3 uppercase tracking-widest font-bold text-[10px]">// Thông tin lỗi:</p>
          <p className="whitespace-pre-wrap">{error}</p>
        </div>
        <button 
          onClick={() => { setLoading(true); fetchTransactions(); }}
          className="mt-6 px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-sm font-bold transition-all shadow-lg active:scale-95"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Quản lý Tài sản & DCA</h2>
          <p className="text-slate-500 mt-1 font-medium">Theo dõi biến động và tối ưu hóa danh mục đầu tư đa kênh.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsManagingAssets(!isManagingAssets)}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
          >
            <Database className="w-4 h-4 text-slate-400" />
            Quản lý Loại Vàng/BĐS
          </button>
          <button
            onClick={() => {
              setIsAdding(!isAdding);
              setEditingId(null);
              setFormData({
                asset_type: 'crypto',
                asset_symbol: 'BTC',
                transaction_type: 'buy',
                amount: '',
                price_per_unit: '',
                interest_rate: '',
                date: new Date().toISOString().split('T')[0],
                currency: 'USD'
              });
            }}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Thêm Giao dịch
          </button>
        </div>
      </div>

      {/* Inflation Hedge Score Card */}
      <div className={cn("p-6 rounded-3xl border shadow-sm flex flex-col md:flex-row items-center justify-between gap-6", getScoreBg(inflationScore))}>
        <div className="flex items-center gap-4">
          <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center bg-white shadow-sm", getScoreColor(inflationScore))}>
            {inflationScore >= 5 ? <ShieldCheck className="w-8 h-8" /> : <ShieldAlert className="w-8 h-8" />}
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">Điểm Phòng vệ Lạm phát</h3>
            <p className="text-sm font-medium text-slate-600 mt-1">{getScoreMessage(inflationScore)}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 bg-white px-6 py-4 rounded-2xl shadow-sm">
          <div className="text-right">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Điểm số</div>
            <div className={cn("text-3xl font-black", getScoreColor(inflationScore))}>
              {totalPortfolioValue > 0 ? inflationScore.toFixed(1) : '-'} <span className="text-lg text-slate-300">/ 10</span>
            </div>
          </div>
          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className={cn("h-full rounded-full transition-all duration-1000", 
                inflationScore >= 8 ? "bg-emerald-500" : 
                inflationScore >= 5 ? "bg-amber-500" : "bg-rose-500"
              )}
              style={{ width: `${(inflationScore / 10) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>

      {isManagingAssets && (
        <div className="p-4 sm:p-6 lg:p-8 rounded-3xl border border-slate-200 bg-white shadow-sm space-y-6 lg:space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                <Database className="w-5 h-5 text-slate-400" />
              </div>
              <h3 className="font-bold text-lg text-slate-900">Quản lý Loại Vàng & Bất động sản</h3>
            </div>
            <button onClick={() => setIsManagingAssets(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <form onSubmit={handleSaveAsset} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end p-6 rounded-2xl bg-slate-50/50 border border-slate-100">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Danh mục</label>
              <select
                value={newAsset.category}
                onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              >
                <option value="gold">Vàng</option>
                <option value="real_estate">Bất động sản</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tên loại (VD: SJC Miếng...)</label>
              <input
                type="text"
                required
                placeholder="Nhập tên tài sản..."
                value={newAsset.name}
                onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Giá hiện tại ({currency})</label>
              <input
                type="text"
                required
                placeholder="0.00"
                value={newAsset.current_price}
                onChange={(e) => setNewAsset({ ...newAsset, current_price: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSavingAsset}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-50"
              >
                {isSavingAsset ? 'Đang lưu...' : (editingAssetId ? 'Cập nhật' : 'Thêm mới')}
              </button>
              {editingAssetId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingAssetId(null);
                    setNewAsset({ category: 'gold', name: '', current_price: '' });
                  }}
                  className="px-4 py-2.5 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-sm font-bold transition-all"
                >
                  Hủy
                </button>
              )}
            </div>
          </form>

          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] text-slate-400 bg-slate-50/50 border-b border-slate-100 uppercase tracking-widest font-bold">
                <tr>
                  <th className="px-6 py-4">Danh mục</th>
                  <th className="px-6 py-4">Tên loại</th>
                  <th className="px-6 py-4 text-right">Giá hiện tại</th>
                  <th className="px-6 py-4 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assetDefinitions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400 italic font-medium">Chưa có loại tài sản nào được định nghĩa.</td>
                  </tr>
                ) : (
                  assetDefinitions.map((asset) => (
                    <tr key={asset.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                          asset.category === 'gold' ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-600"
                        )}>
                          {asset.category === 'gold' ? 'Vàng' : 'Bất động sản'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900">{asset.name}</td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-slate-700">
                        {formatCurrency(currency === 'VND' ? parseFloat(asset.current_price) * exchangeRate : parseFloat(asset.current_price), currency)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEditAsset(asset)}
                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteAsset(asset.id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isAdding && (
        <div className="p-4 sm:p-6 lg:p-8 rounded-3xl border border-slate-200 bg-white shadow-sm space-y-6 lg:space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                <Plus className="w-5 h-5 text-slate-400" />
              </div>
              <h3 className="font-bold text-lg text-slate-900">{editingId ? 'Cập nhật Giao dịch' : 'Thêm Giao dịch Mới'}</h3>
            </div>
            <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loại tài sản</label>
                <div className="grid grid-cols-2 gap-2">
                  {['crypto', 'gold', 'bank', 'real_estate'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        const symbol = type === 'crypto' ? 'BTC' : (type === 'gold' ? (assetDefinitions.find(a => a.category === 'gold')?.symbol || '') : (type === 'bank' ? 'Vietcombank' : (assetDefinitions.find(a => a.category === 'real_estate')?.symbol || '')));
                        setFormData({ 
                          ...formData, 
                          asset_type: type, 
                          asset_symbol: symbol,
                          transaction_type: type === 'bank' ? 'deposit' : 'buy',
                          amount: type === 'real_estate' ? '1' : '',
                          price_per_unit: '',
                          currency: type === 'crypto' ? 'USD' : 'VND'
                        });
                      }}
                      className={cn(
                        "px-4 py-2.5 rounded-xl text-xs font-bold transition-all border",
                        formData.asset_type === type 
                          ? "bg-slate-900 border-slate-900 text-white shadow-md" 
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      )}
                    >
                      {type === 'crypto' ? 'Crypto' : type === 'gold' ? 'Vàng' : type === 'bank' ? 'Ngân hàng' : 'BĐS'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mã / Tên tài sản</label>
                {formData.asset_type === 'gold' || formData.asset_type === 'real_estate' ? (
                  <select
                    value={formData.asset_symbol}
                    onChange={(e) => setFormData({ ...formData, asset_symbol: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  >
                    <option value="">-- Chọn --</option>
                    {assetDefinitions
                      .filter(a => a.category === formData.asset_type)
                      .map(a => (
                        <option key={a.id} value={a.symbol}>{a.name}</option>
                      ))}
                  </select>
                ) : formData.asset_type === 'crypto' ? (
                  <select
                    value={formData.asset_symbol}
                    onChange={(e) => setFormData({ ...formData, asset_symbol: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  >
                    <option value="BTC">BTC</option>
                    <option value="USDT">USDT</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder={formData.asset_type === 'bank' ? 'Tên ngân hàng...' : 'Tên tài sản...'}
                    value={formData.asset_symbol}
                    onChange={(e) => setFormData({ ...formData, asset_symbol: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loại giao dịch</label>
                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                  {['buy', 'sell', 'deposit', 'withdraw'].filter(type => {
                    if (formData.asset_type === 'bank') return type === 'deposit' || type === 'withdraw';
                    return type === 'buy' || type === 'sell';
                  }).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData({ ...formData, transaction_type: type })}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                        formData.transaction_type === type 
                          ? "bg-white text-slate-900 shadow-sm" 
                          : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {type === 'buy' ? 'Mua' : type === 'sell' ? 'Bán' : type === 'deposit' ? 'Gửi' : 'Rút'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {formData.asset_type !== 'real_estate' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {formData.asset_type === 'bank' ? 'Số tiền (VND)' : `Số lượng ${formData.asset_type === 'gold' ? '(Lượng)' : ''}`}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="0.00"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {formData.asset_type === 'bank' ? 'Lãi suất (%)' : formData.asset_type === 'real_estate' ? `Giá trị (${formData.currency})` : `Giá (${formData.currency})`}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="0.00"
                    value={formData.asset_type === 'bank' ? formData.interest_rate : formData.price_per_unit}
                    onChange={(e) => setFormData({ ...formData, [formData.asset_type === 'bank' ? 'interest_rate' : 'price_per_unit']: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ngày giao dịch</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tiền tệ</label>
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900">
                    {formData.asset_type === 'crypto' ? 'USD' : 'VND'}
                  </div>
                </div>
              </div>

              <div className="pt-6 flex gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang xử lý...' : (editingId ? 'Cập nhật' : 'Lưu Giao dịch')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingId(null);
                  }}
                  className="px-6 py-3 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-sm font-bold transition-all"
                >
                  Hủy
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
              <History className="w-5 h-5 text-slate-400" />
            </div>
            <h3 className="font-bold text-lg text-slate-900">Lịch sử Giao dịch</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tổng cộng:</span>
            <span className="text-sm font-bold text-slate-900">{transactions.length}</span>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] text-slate-400 bg-slate-50/50 border-b border-slate-100 uppercase tracking-widest font-bold">
              <tr>
                <th className="px-6 py-4">Ngày</th>
                <th className="px-6 py-4">Tài sản</th>
                <th className="px-6 py-4">Loại</th>
                <th className="px-6 py-4 text-right">Số lượng</th>
                <th className="px-6 py-4 text-right">Giá / Lãi suất</th>
                <th className="px-6 py-4 text-right">Tổng giá trị</th>
                <th className="px-6 py-4 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-slate-400 italic font-medium">
                    Chưa có giao dịch nào. Hãy thêm giao dịch đầu tiên của bạn.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => {
                  const currentValueInUsd = calculateCurrentValue(t);
                  const txCurrency = (t.currency || 'USD') as 'USD' | 'VND';
                  const displayValue = txCurrency === 'VND' ? currentValueInUsd * exchangeRate : currentValueInUsd;
                  const displayPrice = parseFloat(t.price_per_unit);

                  return (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 font-mono text-xs text-slate-500 font-medium">
                        {new Date(t.date).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{t.asset_symbol}</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                            t.asset_type === 'crypto' ? "bg-slate-900 text-white" :
                            t.asset_type === 'gold' ? "bg-amber-50 text-amber-600" :
                            t.asset_type === 'bank' ? "bg-emerald-50 text-emerald-600" :
                            "bg-slate-50 text-slate-600"
                          )}>
                            {t.asset_type}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                          (t.transaction_type === 'buy' || t.transaction_type === 'deposit') ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                        )}>
                          {t.transaction_type === 'deposit' ? 'Gửi' : 
                           t.transaction_type === 'withdraw' ? 'Rút' : 
                           t.transaction_type === 'buy' ? 'Mua' : 'Bán'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-slate-700">
                        {t.asset_type === 'real_estate' ? '-' : parseFloat(t.amount).toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 })}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-500 font-medium">
                        {t.asset_type === 'bank' ? `${t.interest_rate}%` : formatCurrency(displayPrice, t.currency as 'USD' | 'VND')}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(displayValue, t.currency as 'USD' | 'VND')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(t)}
                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
