import React, { useState, useEffect } from 'react';
import { Plus, AlertCircle, ArrowUpRight, ArrowDownRight, DollarSign, X, Edit2, Trash2, Calendar, History, TrendingUp, PieChart, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';
import { formatCurrency, formatCompactCurrency, parseInputNumber } from '../lib/format';
import { useAuth } from '../contexts/AuthContext';

interface CashFlow {
  id: number;
  type: 'income' | 'expense';
  category: string;
  amount: string;
  currency: string;
  date: string;
  description: string;
}

export default function CashFlow() {
  const { currency, exchangeRate } = useStore();
  const { fetchApi } = useAuth();
  const [cashFlows, setCashFlows] = useState<CashFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    type: 'income',
    category: 'Lương',
    amount: '',
    currency: currency, // Default to current global currency
    date: new Date().toISOString().split('T')[0],
    description: ''
  });

  // Update formData currency when global currency changes
  useEffect(() => {
    if (!editingId) {
      setFormData(prev => ({ ...prev, currency }));
    }
  }, [currency, editingId]);

  const fetchCashFlows = async () => {
    try {
      const res = await fetchApi('/api/cashflow');
      if (!res.ok) throw new Error('Failed to fetch data');
      const data = await res.json();
      setCashFlows(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCashFlows();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const url = editingId ? `/api/cashflow/${editingId}` : '/api/cashflow';
      const method = editingId ? 'PUT' : 'POST';
      
      const parsedAmount = parseInputNumber(formData.amount);

      const res = await fetchApi(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, amount: parsedAmount })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to save cash flow');
      
      setIsAdding(false);
      setEditingId(null);
      setFormData({ 
        type: 'income', 
        category: 'Lương', 
        amount: '', 
        currency: currency, 
        date: new Date().toISOString().split('T')[0],
        description: '' 
      });
      fetchCashFlows();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa ghi chép này?')) return;
    try {
      const res = await fetchApi(`/api/cashflow/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      fetchCashFlows();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEdit = (cf: CashFlow) => {
    setEditingId(cf.id);
    setFormData({
      type: cf.type,
      category: cf.category,
      amount: cf.amount,
      currency: cf.currency as 'USD' | 'VND',
      date: cf.date.split('T')[0],
      description: cf.description
    });
    setIsAdding(true);
  };

  const calculateTotal = (type: 'income' | 'expense') => {
    return cashFlows
      .filter(cf => cf.type === type)
      .reduce((sum, cf) => {
        const amount = parseFloat(cf.amount);
        const cfCurrency = cf.currency || 'USD';
        
        // Convert to current display currency
        if (currency === 'VND') {
          return sum + (cfCurrency === 'USD' ? amount * exchangeRate : amount);
        } else {
          return sum + (cfCurrency === 'VND' ? amount / exchangeRate : amount);
        }
      }, 0);
  };

  const totalIncome = calculateTotal('income');
  const totalExpense = calculateTotal('expense');
  const netCashFlow = totalIncome - totalExpense;

  // --- New Features: Leakage Analysis & Allocation Rules ---
  const getMonthStr = (dateStr: string) => dateStr.substring(0, 7);
  const currentMonthStr = getMonthStr(new Date().toISOString());
  const previousMonthDate = new Date();
  previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
  const previousMonthStr = getMonthStr(previousMonthDate.toISOString());

  const currentMonthExpenses = cashFlows.filter(cf => cf.type === 'expense' && getMonthStr(cf.date) === currentMonthStr);
  const previousMonthExpenses = cashFlows.filter(cf => cf.type === 'expense' && getMonthStr(cf.date) === previousMonthStr);

  const getCategoryTotal = (expenses: CashFlow[], category: string) => {
    return expenses.filter(cf => cf.category === category).reduce((sum, cf) => {
      const amount = parseFloat(cf.amount);
      const cfCurrency = cf.currency || 'USD';
      if (currency === 'VND') return sum + (cfCurrency === 'USD' ? amount * exchangeRate : amount);
      return sum + (cfCurrency === 'VND' ? amount / exchangeRate : amount);
    }, 0);
  };

  const expenseCategoriesList = ['Sinh hoạt', 'Đầu tư', 'Trả nợ', 'Giải trí', 'Khác'];
  const leakages = expenseCategoriesList.map(cat => {
    const current = getCategoryTotal(currentMonthExpenses, cat);
    const previous = getCategoryTotal(previousMonthExpenses, cat);
    const increase = previous > 0 ? ((current - previous) / previous) * 100 : (current > 0 ? 100 : 0);
    return { category: cat, current, previous, increase };
  }).filter(l => l.increase > 20 && l.current > 0);

  const currentMonthIncome = cashFlows.filter(cf => cf.type === 'income' && getMonthStr(cf.date) === currentMonthStr).reduce((sum, cf) => {
      const amount = parseFloat(cf.amount);
      const cfCurrency = cf.currency || 'USD';
      if (currency === 'VND') return sum + (cfCurrency === 'USD' ? amount * exchangeRate : amount);
      return sum + (cfCurrency === 'VND' ? amount / exchangeRate : amount);
  }, 0);

  const needsTotal = getCategoryTotal(currentMonthExpenses, 'Sinh hoạt') + getCategoryTotal(currentMonthExpenses, 'Trả nợ');
  const wantsTotal = getCategoryTotal(currentMonthExpenses, 'Giải trí') + getCategoryTotal(currentMonthExpenses, 'Khác');
  const savingsTotal = getCategoryTotal(currentMonthExpenses, 'Đầu tư');

  const totalAllocated = needsTotal + wantsTotal + savingsTotal;
  const allocationBase = currentMonthIncome > 0 ? currentMonthIncome : (totalAllocated > 0 ? totalAllocated : 1);

  const needsPct = (needsTotal / allocationBase) * 100;
  const wantsPct = (wantsTotal / allocationBase) * 100;
  const savingsPct = (savingsTotal / allocationBase) * 100;
  // ---------------------------------------------------------

  const categories = formData.type === 'income' 
    ? ['Lương', 'Thưởng', 'Kinh doanh', 'Cổ tức', 'Khác']
    : ['Sinh hoạt', 'Đầu tư', 'Trả nợ', 'Giải trí', 'Khác'];

  if (loading) {
    return <div className="flex items-center justify-center h-full text-slate-400">Đang tải dữ liệu...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Dòng tiền (Cash Flow)</h2>
          <p className="text-slate-500 mt-1 font-medium">Theo dõi thu nhập và chi tiêu để tối ưu hóa nguồn vốn đầu tư.</p>
        </div>
        <button
          onClick={() => {
            setIsAdding(!isAdding);
            if (isAdding) {
              setEditingId(null);
              setFormData({ 
                type: 'income', 
                category: 'Lương', 
                amount: '', 
                currency: currency, 
                date: new Date().toISOString().split('T')[0],
                description: '' 
              });
            }
          }}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
        >
          {isAdding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {isAdding ? 'Hủy' : 'Thêm Giao dịch'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tổng Thu</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">
            {formatCompactCurrency(totalIncome, currency)}
          </div>
        </div>
        <div className="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
              <ArrowDownRight className="w-5 h-5 text-rose-600" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tổng Chi</span>
          </div>
          <div className="text-2xl font-bold text-rose-600">
            {formatCompactCurrency(totalExpense, currency)}
          </div>
        </div>
        <div className="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-slate-400" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dòng tiền ròng</span>
          </div>
          <div className={cn("text-2xl font-bold", netCashFlow >= 0 ? "text-emerald-600" : "text-rose-600")}>
            {netCashFlow >= 0 ? '+' : '-'}{formatCompactCurrency(Math.abs(netCashFlow), currency)}
          </div>
        </div>
      </div>

      {/* Advanced Analysis Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leakage Analysis */}
        <div className="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900">Phân tích rò rỉ tài chính</h3>
              <p className="text-xs font-medium text-slate-500">Cảnh báo chi tiêu tăng đột biến so với tháng trước</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {leakages.length === 0 ? (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Tuyệt vời! Không có hạng mục nào tăng đột biến trong tháng này.
              </div>
            ) : (
              leakages.map((leak, idx) => (
                <div key={idx} className="p-4 rounded-2xl border border-rose-100 bg-rose-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                    <div>
                      <div className="font-bold text-sm text-slate-900">{leak.category}</div>
                      <div className="text-xs font-medium text-slate-500">
                        Tháng trước: {formatCurrency(leak.previous, currency)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm text-rose-600">
                      +{leak.increase.toFixed(1)}%
                    </div>
                    <div className="text-xs font-medium text-slate-500">
                      {formatCurrency(leak.current, currency)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Allocation Rules */}
        <div className="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              <PieChart className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900">Quy tắc phân bổ (Tháng này)</h3>
              <p className="text-xs font-medium text-slate-500">So sánh với quy tắc chuẩn 50/30/20</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Needs */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-bold text-slate-700">Thiết yếu (Mục tiêu: 50%)</span>
                <span className={cn("font-bold", needsPct > 50 ? "text-rose-600" : "text-emerald-600")}>
                  {needsPct.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={cn("h-full rounded-full", needsPct > 50 ? "bg-rose-500" : "bg-emerald-500")} 
                  style={{ width: `${Math.min(needsPct, 100)}%` }}
                ></div>
              </div>
              <div className="text-xs text-slate-500 mt-1 text-right">{formatCompactCurrency(needsTotal, currency)}</div>
            </div>

            {/* Wants */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-bold text-slate-700">Cá nhân (Mục tiêu: 30%)</span>
                <span className={cn("font-bold", wantsPct > 30 ? "text-rose-600" : "text-emerald-600")}>
                  {wantsPct.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={cn("h-full rounded-full", wantsPct > 30 ? "bg-rose-500" : "bg-emerald-500")} 
                  style={{ width: `${Math.min(wantsPct, 100)}%` }}
                ></div>
              </div>
              <div className="text-xs text-slate-500 mt-1 text-right">{formatCompactCurrency(wantsTotal, currency)}</div>
            </div>

            {/* Savings/Investments */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-bold text-slate-700">Đầu tư/Tiết kiệm (Mục tiêu: 20%)</span>
                <span className={cn("font-bold", savingsPct < 20 ? "text-amber-600" : "text-emerald-600")}>
                  {savingsPct.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={cn("h-full rounded-full", savingsPct < 20 ? "bg-amber-500" : "bg-emerald-500")} 
                  style={{ width: `${Math.min(savingsPct, 100)}%` }}
                ></div>
              </div>
              <div className="text-xs text-slate-500 mt-1 text-right">{formatCompactCurrency(savingsTotal, currency)}</div>
            </div>
          </div>
        </div>
      </div>


      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center gap-3 text-sm font-medium animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {isAdding && (
        <div className="p-4 sm:p-6 lg:p-8 rounded-3xl border border-slate-200 bg-white shadow-sm space-y-6 lg:space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                <Plus className="w-5 h-5 text-slate-400" />
              </div>
              <h3 className="font-bold text-lg text-slate-900">{editingId ? 'Chỉnh sửa ghi chép' : 'Ghi chép mới'}</h3>
            </div>
            <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ngày</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loại</label>
                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                  {['income', 'expense'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setFormData({ 
                          ...formData, 
                          type: type as 'income' | 'expense', 
                          category: type === 'income' ? 'Lương' : 'Sinh hoạt' 
                        });
                      }}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                        formData.type === type 
                          ? "bg-white text-slate-900 shadow-sm" 
                          : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {type === 'income' ? 'Thu nhập' : 'Chi tiêu'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Danh mục</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Số tiền</label>
                  <input
                    type="text"
                    required
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tiền tệ</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value as 'USD' | 'VND' })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  >
                    <option value="USD">USD</option>
                    <option value="VND">VND</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ghi chú</label>
                <input
                  type="text"
                  placeholder="VD: Lương tháng 3"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
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
            <h3 className="font-bold text-lg text-slate-900">Lịch sử Dòng tiền</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tổng cộng:</span>
            <span className="text-sm font-bold text-slate-900">{cashFlows.length}</span>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] text-slate-400 bg-slate-50/50 border-b border-slate-100 uppercase tracking-widest font-bold">
              <tr>
                <th className="px-6 py-4">Ngày</th>
                <th className="px-6 py-4">Loại</th>
                <th className="px-6 py-4">Danh mục</th>
                <th className="px-6 py-4">Ghi chú</th>
                <th className="px-6 py-4 text-right">Số tiền</th>
                <th className="px-6 py-4 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cashFlows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-slate-400 italic font-medium">
                    Chưa có ghi chép nào. Hãy thêm giao dịch đầu tiên của bạn.
                  </td>
                </tr>
              ) : (
                cashFlows.map((cf) => {
                  const amount = parseFloat(cf.amount);
                  const cfCurrency = cf.currency || 'USD';
                  
                  // Convert for display
                  let displayAmount = amount;
                  if (currency === 'VND' && cfCurrency === 'USD') {
                    displayAmount = amount * exchangeRate;
                  } else if (currency === 'USD' && cfCurrency === 'VND') {
                    displayAmount = amount / exchangeRate;
                  }

                  return (
                    <tr key={cf.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 font-mono text-xs text-slate-500 font-medium">
                        {new Date(cf.date).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                          cf.type === 'income' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                        )}>
                          {cf.type === 'income' ? 'Thu nhập' : 'Chi tiêu'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900">
                        {cf.category}
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium">
                        {cf.description || '-'}
                      </td>
                      <td className={cn(
                        "px-6 py-4 text-right font-mono font-bold",
                        cf.type === 'income' ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {cf.type === 'income' ? '+' : '-'}{formatCurrency(displayAmount, currency)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(cf)}
                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(cf.id)}
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
