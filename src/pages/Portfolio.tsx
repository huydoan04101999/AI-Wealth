import React, { useState, useEffect } from 'react';
import { Plus, Database, AlertCircle, TrendingUp, ArrowDownRight, ArrowUpRight, Edit2, Trash2, Calendar, X, History, ShieldCheck, ShieldAlert, ChevronLeft, ChevronRight } from 'lucide-react';
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
  term?: number;
  date: string;
  currency: string;
  status?: string;
  linked_id?: number;
}

interface AssetDefinition {
  id: number;
  category: string;
  name: string;
  symbol: string;
  current_price: string;
  price_history?: string;
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
  const [viewingHistoryAsset, setViewingHistoryAsset] = useState<AssetDefinition | null>(null);

  // Form state
  const [isAdding, setIsAdding] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [formData, setFormData] = useState({
    asset_type: 'crypto',
    asset_symbol: 'BTC',
    transaction_type: 'buy',
    amount: '',
    price_per_unit: '',
    interest_rate: '',
    term: '',
    date: new Date().toISOString().split('T')[0],
    currency: 'USD', // Default to USD for BTC
    status: 'active',
    linked_id: '' as string | number
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

  useEffect(() => {
    const autoSettle = async () => {
      const matured = transactions.filter(t => {
        if (t.asset_type !== 'bank' || t.transaction_type !== 'deposit' || t.status === 'settled') return false;
        if (!t.term) return false;
        
        const maturityDate = new Date(t.date);
        maturityDate.setMonth(maturityDate.getMonth() + t.term);
        return maturityDate <= new Date();
      });
      
      if (matured.length > 0) {
        let changed = false;
        for (const t of matured) {
          const success = await settleMaturedDeposit(t);
          if (success) changed = true;
        }
        if (changed) fetchTransactions();
      }
    };
    
    if (transactions.length > 0) {
      autoSettle();
    }
  }, [transactions.length]);

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

      const parsedAmount = (formData.asset_type === 'real_estate' && formData.transaction_type !== 'borrow' && formData.transaction_type !== 'repay') ? '1' : (parseInputNumber(formData.amount) || '0');
      const parsedPrice = (formData.asset_type === 'bank' || formData.transaction_type === 'borrow' || formData.transaction_type === 'repay') ? '1' : (parseInputNumber(formData.price_per_unit) || '0');
      const parsedInterest = formData.interest_rate ? parseInputNumber(formData.interest_rate) : '0';
      const parsedTerm = formData.term ? parseInt(formData.term) : 0;

      const res = await fetchApi(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...formData, 
          amount: parsedAmount,
          price_per_unit: parsedPrice,
          interest_rate: parsedInterest,
          term: parsedTerm,
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
    setConfirmModal({
      isOpen: true,
      title: 'Xóa giao dịch',
      message: 'Bạn có chắc chắn muốn xóa giao dịch này?',
      onConfirm: async () => {
        try {
          const res = await fetchApi(`/api/portfolio/transactions/${id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete');
          fetchTransactions();
        } catch (err: any) {
          console.error(err);
        }
        setConfirmModal(null);
      }
    });
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
      term: tx.term?.toString() || '',
      date: new Date(tx.date).toISOString().split('T')[0],
      currency: (tx.currency || 'USD') as 'USD' | 'VND',
      status: tx.status || 'active',
      linked_id: tx.linked_id || ''
    });
    setIsAdding(true);
  };

  const handleSettleBankDeposit = async (depositTx: Transaction) => {
    setConfirmModal({
      isOpen: true,
      title: 'Tất toán khoản tiền gửi',
      message: 'Bạn có chắc chắn muốn tất toán khoản tiền gửi này?',
      onConfirm: async () => {
        await settleMaturedDeposit(depositTx);
        setConfirmModal(null);
        fetchTransactions();
      }
    });
  };

  const settleMaturedDeposit = async (depositTx: Transaction) => {
    const currentValueInUsd = calculateCurrentValue(depositTx);
    const currentValueInOriginalCurrency = depositTx.currency === 'VND' ? currentValueInUsd * exchangeRate : currentValueInUsd;
    
    try {
      // 1. Create withdraw from bank
      const res = await fetchApi('/api/portfolio/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_type: 'bank',
          asset_symbol: depositTx.asset_symbol,
          transaction_type: 'withdraw',
          amount: currentValueInOriginalCurrency.toString(),
          price_per_unit: '1',
          currency: depositTx.currency,
          date: new Date().toISOString().split('T')[0],
          linked_id: depositTx.id
        })
      });
      
      if (!res.ok) throw new Error('Failed to create withdraw transaction');

      // 2. Create deposit to cash
      await fetchApi('/api/portfolio/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_type: 'cash',
          asset_symbol: 'Tiền mặt',
          transaction_type: 'deposit',
          amount: currentValueInOriginalCurrency.toString(),
          price_per_unit: '1',
          currency: depositTx.currency,
          date: new Date().toISOString().split('T')[0],
          linked_id: depositTx.id
        })
      });
      
      // 3. Mark original deposit as settled
      await fetchApi(`/api/portfolio/transactions/${depositTx.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...depositTx,
          status: 'settled'
        })
      });
      
      return true;
    } catch (err: any) {
      console.error(err);
      return false;
    }
  };

  const calculateCurrentValue = (tx: Transaction) => {
    const amount = parseFloat(tx.amount);
    const originalPrice = parseFloat(tx.price_per_unit);
    const txCurrency = tx.currency || 'USD';
    
    // Normalize base value to USD for internal calculations
    const baseValueInUsd = txCurrency === 'VND' ? (amount * originalPrice) / exchangeRate : (amount * originalPrice);

    if (tx.asset_type === 'bank' && tx.interest_rate && tx.transaction_type === 'deposit') {
      if (tx.status === 'settled') {
        const withdrawTx = transactions.find(t => t.linked_id === tx.id && t.transaction_type === 'withdraw');
        if (withdrawTx) {
          const wAmount = parseFloat(withdrawTx.amount);
          const wPrice = parseFloat(withdrawTx.price_per_unit);
          return withdrawTx.currency === 'VND' ? (wAmount * wPrice) / exchangeRate : (wAmount * wPrice);
        }
      }
      
      const rate = parseFloat(tx.interest_rate) / 100;
      const startDate = new Date(tx.date);
      const now = new Date();
      const diffTime = Math.max(0, now.getTime() - startDate.getTime());
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      
      // If term is specified (in months), check if it's matured
      const termInMonths = tx.term || 0;
      if (termInMonths > 0) {
        const termInDays = termInMonths * 30; // Approximation
        const effectiveDays = Math.min(diffDays, termInDays);
        return baseValueInUsd * (1 + (rate * effectiveDays / 365));
      }

      // Compound interest (daily) in USD for non-term or ongoing
      return baseValueInUsd * Math.pow(1 + rate / 365, diffDays);
    }

    if (tx.transaction_type === 'borrow') {
      const rate = parseFloat(tx.interest_rate || '0') / 100;
      const startDate = new Date(tx.date);
      const now = new Date();
      const diffTime = Math.max(0, now.getTime() - startDate.getTime());
      const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365);
      // Simple interest for loan
      return baseValueInUsd * (1 + rate * diffYears);
    }
    
    if (tx.transaction_type === 'repay') {
      // Find the original borrow transaction to get the interest rate
      const linkedBorrow = transactions.find(t => t.asset_symbol === tx.asset_symbol && t.transaction_type === 'borrow');
      const rate = linkedBorrow ? parseFloat(linkedBorrow.interest_rate || '0') / 100 : 0;
      
      const startDate = new Date(tx.date);
      const now = new Date();
      const diffTime = Math.max(0, now.getTime() - startDate.getTime());
      const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365);
      
      return baseValueInUsd * (1 + rate * diffYears);
    }

    // Use market or custom price (already in USD) for current value
    const currentPriceInUsd = getCurrentPrice(tx.asset_symbol, tx.asset_type);
    return amount * currentPriceInUsd;
  };

  const getCurrentPrice = (symbol: string, type: string) => {
    if (type === 'bank' || type === 'cash') return 1;
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
    if (tx.transaction_type === 'sell' || tx.transaction_type === 'withdraw' || tx.transaction_type === 'borrow') {
      acc[tx.asset_type] = (acc[tx.asset_type] || 0) - value;
    } else {
      acc[tx.asset_type] = (acc[tx.asset_type] || 0) + value;
    }
    return acc;
  }, {} as Record<string, number>);

  const totalPortfolioValue = Object.values(assetTotals).reduce((sum, val) => sum + val, 0);
  
  const totalInvestedInUsd = transactions.reduce((sum, tx) => {
    const amount = parseFloat(tx.amount);
    const price = parseFloat(tx.price_per_unit);
    const txCurrency = tx.currency || 'USD';
    const valueInUsd = txCurrency === 'VND' ? (amount * price) / exchangeRate : (amount * price);
    
    if (tx.transaction_type === 'buy' || tx.transaction_type === 'deposit' || tx.transaction_type === 'repay') {
      return sum + valueInUsd;
    } else {
      return sum - valueInUsd;
    }
  }, 0);

  const totalProfitLoss = totalPortfolioValue - totalInvestedInUsd;
  const totalProfitLossPercentage = totalInvestedInUsd > 0 ? (totalProfitLoss / totalInvestedInUsd) * 100 : 0;

  // Calculate score based on weights
  // Bank/Cash: 1, Bonds: 3, Crypto: 8, Gold: 9, Real Estate: 10
  let inflationScore = 0;
  if (totalPortfolioValue > 0) {
    const bankWeight = (assetTotals['bank'] || 0) / totalPortfolioValue;
    const cashWeight = (assetTotals['cash'] || 0) / totalPortfolioValue;
    const cryptoWeight = (assetTotals['crypto'] || 0) / totalPortfolioValue;
    const goldWeight = (assetTotals['gold'] || 0) / totalPortfolioValue;
    const realEstateWeight = (assetTotals['real_estate'] || 0) / totalPortfolioValue;

    // Weighted average score (0-10)
    inflationScore = (bankWeight * 1) + (cashWeight * 1) + (cryptoWeight * 8) + (goldWeight * 9) + (realEstateWeight * 10);
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

  const holdings = React.useMemo(() => {
    const map = new Map<string, any>();
    
    // First pass: Process all deposits and buys to establish holdings
    transactions.forEach(tx => {
      if (tx.asset_type === 'bank') {
        if (tx.transaction_type === 'deposit') {
          const amount = parseFloat(tx.amount);
          const price = parseFloat(tx.price_per_unit);
          const txCurrency = tx.currency || 'USD';
          const valueInUsd = txCurrency === 'VND' ? (amount * price) / exchangeRate : (amount * price);
          
          const startDate = new Date(tx.date);
          const now = new Date();
          const diffTime = Math.max(0, now.getTime() - startDate.getTime());
          const diffDays = diffTime / (1000 * 60 * 60 * 24);
          const termInMonths = tx.term || 0;
          const isMatured = termInMonths > 0 && diffDays >= (termInMonths * 30);

          map.set(`bank-${tx.id}`, {
            id: `bank-${tx.id}`,
            asset_type: 'bank',
            asset_symbol: tx.asset_symbol,
            totalAmount: valueInUsd, // Store in USD for consistent display
            totalInvested: valueInUsd,
            currentValue: calculateCurrentValue(tx),
            transactions: [tx],
            status: tx.status || 'active',
            depositTx: tx,
            isMatured,
            loanAmount: 0,
            loanCurrentValue: 0
          });
        }
      } else if (tx.asset_type === 'cash') {
        const key = 'cash-total';
        if (!map.has(key)) {
          map.set(key, {
            id: key,
            asset_type: 'cash',
            asset_symbol: 'Tiền mặt',
            totalAmount: 0,
            totalInvested: 0,
            currentValue: 0,
            transactions: [],
            loanAmount: 0,
            loanCurrentValue: 0
          });
        }
        const holding = map.get(key);
        holding.transactions.push(tx);
        const amount = parseFloat(tx.amount);
        const price = parseFloat(tx.price_per_unit);
        const txCurrency = tx.currency || 'USD';
        const valueInUsd = txCurrency === 'VND' ? (amount * price) / exchangeRate : (amount * price);
        
        if (tx.transaction_type === 'deposit') {
          holding.totalAmount += valueInUsd;
          holding.totalInvested += valueInUsd;
          holding.currentValue += valueInUsd;
        } else if (tx.transaction_type === 'withdraw') {
          holding.totalAmount -= valueInUsd;
          holding.totalInvested -= valueInUsd;
          holding.currentValue -= valueInUsd;
        }
      } else {
        const key = `${tx.asset_type}-${tx.asset_symbol}`;
        if (!map.has(key)) {
          map.set(key, {
            id: key,
            asset_type: tx.asset_type,
            asset_symbol: tx.asset_symbol,
            totalAmount: 0,
            totalInvested: 0,
            currentValue: 0,
            transactions: [],
            loanAmount: 0,
            loanCurrentValue: 0
          });
        }
        
        const holding = map.get(key);
        holding.transactions.push(tx);
        
        const amount = parseFloat(tx.amount);
        const price = parseFloat(tx.price_per_unit);
        const txCurrency = tx.currency || 'USD';
        const valueInUsd = txCurrency === 'VND' ? (amount * price) / exchangeRate : (amount * price);
        
        if (tx.transaction_type === 'buy') {
          holding.totalAmount += amount;
          holding.totalInvested += valueInUsd;
        } else if (tx.transaction_type === 'sell') {
          holding.totalAmount -= amount;
          holding.totalInvested -= valueInUsd;
        } else if (tx.transaction_type === 'borrow') {
          holding.loanAmount += amount;
          holding.totalInvested -= valueInUsd;
        } else if (tx.transaction_type === 'repay') {
          holding.loanAmount -= amount;
          holding.totalInvested += valueInUsd;
        }
      }
    });

    // Second pass: Process bank withdrawals that are linked to deposits
    transactions.forEach(tx => {
      if (tx.asset_type === 'bank' && tx.transaction_type === 'withdraw' && tx.linked_id) {
        const holdingKey = `bank-${tx.linked_id}`;
        const holding = map.get(holdingKey);
        if (holding) {
          holding.transactions.push(tx);
          const amount = parseFloat(tx.amount);
          const price = parseFloat(tx.price_per_unit);
          const txCurrency = tx.currency || 'USD';
          const valueInUsd = txCurrency === 'VND' ? (amount * price) / exchangeRate : (amount * price);
          
          holding.totalAmount -= valueInUsd;
          // Note: currentValue is already calculated by calculateCurrentValue(tx) in first pass if it's a deposit
          // But we might need to recalculate it if it's partially withdrawn
          holding.currentValue = calculateCurrentValue(holding.depositTx);
        }
      }
    });
    
    map.forEach(holding => {
      if (holding.asset_type !== 'bank' && holding.asset_type !== 'cash') {
        const currentPriceInUsd = getCurrentPrice(holding.asset_symbol, holding.asset_type);
        let assetValue = holding.totalAmount * currentPriceInUsd;
        
        let loanCurrentValue = 0;
        holding.transactions.forEach((tx: Transaction) => {
          if (tx.transaction_type === 'borrow') {
            loanCurrentValue += calculateCurrentValue(tx);
          } else if (tx.transaction_type === 'repay') {
            loanCurrentValue -= calculateCurrentValue(tx);
          }
        });
        loanCurrentValue = Math.max(0, loanCurrentValue);
        
        holding.currentValue = assetValue - loanCurrentValue;
        holding.loanCurrentValue = loanCurrentValue;
      }
    });
    
    return Array.from(map.values()).filter(h => 
      (h.asset_type === 'bank' && h.status !== 'settled') || 
      (h.asset_type === 'cash' && Math.abs(h.totalAmount) > 0.01) ||
      (h.asset_type !== 'bank' && h.asset_type !== 'cash' && h.totalAmount > 0)
    );
  }, [transactions, assetDefinitions, marketPrices, exchangeRate, currency]);

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
                term: '',
                date: new Date().toISOString().split('T')[0],
                currency: 'USD',
                status: 'active',
                linked_id: ''
              });
            }}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Thêm Giao dịch
          </button>
        </div>
      </div>
      
      {/* Portfolio Summary Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-slate-400">
            <TrendingUp className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Tổng giá trị hiện tại</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-black text-slate-900">
              {formatCurrency(currency === 'VND' ? totalPortfolioValue * exchangeRate : totalPortfolioValue, currency)}
            </span>
            {currency === 'VND' && (
              <span className="text-xs font-medium text-slate-400">
                ≈ {formatCurrency(totalPortfolioValue, 'USD')}
              </span>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-slate-400">
            <History className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Tổng vốn đầu tư</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-black text-slate-900">
              {formatCurrency(currency === 'VND' ? totalInvestedInUsd * exchangeRate : totalInvestedInUsd, currency)}
            </span>
            {currency === 'VND' && (
              <span className="text-xs font-medium text-slate-400">
                ≈ {formatCurrency(totalInvestedInUsd, 'USD')}
              </span>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-slate-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Tổng Lợi nhuận / Lỗ</span>
          </div>
          <div className="flex flex-col">
            <div className={cn(
              "text-2xl font-black flex items-center gap-2",
              totalProfitLoss >= 0 ? "text-emerald-600" : "text-rose-600"
            )}>
              {totalProfitLoss >= 0 ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />}
              {formatCurrency(currency === 'VND' ? Math.abs(totalProfitLoss) * exchangeRate : Math.abs(totalProfitLoss), currency)}
            </div>
            <span className={cn(
              "text-xs font-bold",
              totalProfitLoss >= 0 ? "text-emerald-500" : "text-rose-500"
            )}>
              {totalProfitLoss >= 0 ? '+' : '-'}{Math.abs(totalProfitLossPercentage).toFixed(2)}%
            </span>
          </div>
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

      <Modal 
        isOpen={isManagingAssets} 
        onClose={() => setIsManagingAssets(false)} 
        title="Quản lý Loại Vàng & Bất động sản"
      >
        <div className="space-y-8">
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
                            onClick={() => setViewingHistoryAsset(asset)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Lịch sử giá"
                          >
                            <History className="w-4 h-4" />
                          </button>
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
      </Modal>

      <Modal
        isOpen={isAdding}
        onClose={() => setIsAdding(false)}
        title={editingId ? 'Chỉnh sửa Giao dịch' : 'Thêm Giao dịch Mới'}
      >
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loại tài sản</label>
              <div className="grid grid-cols-5 gap-2">
                {['crypto', 'gold', 'bank', 'real_estate', 'cash'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      const symbol = type === 'crypto' ? 'BTC' : (type === 'gold' ? (assetDefinitions.find(a => a.category === 'gold')?.symbol || '') : (type === 'bank' ? 'Vietcombank' : (type === 'cash' ? 'Tiền mặt' : (assetDefinitions.find(a => a.category === 'real_estate')?.symbol || ''))));
                      setFormData({ 
                        ...formData, 
                        asset_type: type, 
                        asset_symbol: symbol,
                        transaction_type: type === 'bank' ? 'deposit' : (type === 'cash' ? 'deposit' : 'buy'),
                        amount: type === 'real_estate' ? '1' : '',
                        price_per_unit: '1',
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
                    {type === 'crypto' ? 'Crypto' : type === 'gold' ? 'Vàng' : type === 'bank' ? 'Ngân hàng' : type === 'cash' ? 'Tiền mặt' : 'BĐS'}
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
                {['buy', 'sell', 'deposit', 'withdraw', 'borrow', 'repay'].filter(type => {
                  if (formData.asset_type === 'bank' || formData.asset_type === 'cash') return type === 'deposit' || type === 'withdraw';
                  if (formData.asset_type === 'real_estate') return type === 'buy' || type === 'sell' || type === 'borrow' || type === 'repay';
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
                    {type === 'buy' ? 'Mua' : type === 'sell' ? 'Bán' : type === 'deposit' ? 'Gửi' : type === 'withdraw' ? 'Rút' : type === 'borrow' ? 'Vay' : 'Trả nợ'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {(formData.asset_type !== 'real_estate' || formData.transaction_type === 'borrow' || formData.transaction_type === 'repay') && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {formData.asset_type === 'bank' || formData.asset_type === 'cash' ? 'Số tiền (VND)' : formData.transaction_type === 'borrow' ? 'Số tiền vay' : formData.transaction_type === 'repay' ? 'Số tiền trả' : `Số lượng ${formData.asset_type === 'gold' ? '(Lượng)' : ''}`}
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
              {(formData.transaction_type !== 'borrow' && formData.transaction_type !== 'repay' && formData.asset_type !== 'cash') && (
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
              )}
              {(formData.transaction_type === 'borrow') && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Lãi suất vay (%/năm)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="0.00"
                    value={formData.interest_rate}
                    onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
              )}
              {(formData.asset_type === 'bank' || formData.transaction_type === 'borrow') && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {formData.asset_type === 'bank' ? 'Kỳ hạn (Tháng)' : 'Thời hạn vay (Năm)'}
                  </label>
                  <input
                    type="number"
                    placeholder={formData.asset_type === 'bank' ? "0 (Không kỳ hạn)" : "VD: 20"}
                    value={formData.term}
                    onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
              )}
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
      </Modal>

      {/* Current Holdings Section */}
      <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-white">
          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
            <Database className="w-5 h-5 text-slate-400" />
          </div>
          <h3 className="font-bold text-lg text-slate-900">Danh mục tài sản đang nắm giữ</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] text-slate-400 bg-slate-50/50 border-b border-slate-100 uppercase tracking-widest font-bold">
              <tr>
                <th className="px-6 py-4">Tài sản</th>
                <th className="px-6 py-4 text-right">Số lượng / Gốc</th>
                <th className="px-6 py-4 text-right">Giá vốn / Lãi suất</th>
                <th className="px-6 py-4 text-right">Giá trị hiện tại</th>
                <th className="px-6 py-4 text-right">Lãi / Lỗ</th>
                <th className="px-6 py-4 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {holdings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400 italic font-medium">Chưa có tài sản nào đang nắm giữ.</td>
                </tr>
              ) : (
                holdings.map((holding) => {
                  const pl = holding.currentValue - holding.totalInvested;
                  const plPercent = holding.totalInvested > 0 ? (pl / holding.totalInvested) * 100 : 0;
                  
                  return (
                    <tr key={holding.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                            holding.asset_type === 'crypto' ? "bg-blue-50 text-blue-600" :
                            holding.asset_type === 'gold' ? "bg-amber-50 text-amber-600" :
                            holding.asset_type === 'bank' ? "bg-emerald-50 text-emerald-600" :
                            "bg-purple-50 text-purple-600"
                          )}>
                            {holding.asset_type === 'crypto' ? '₿' : holding.asset_type === 'gold' ? 'Au' : holding.asset_type === 'bank' ? '🏦' : '🏠'}
                          </div>
                        <div className="font-bold text-slate-900">{holding.asset_symbol}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                          {holding.asset_type === 'crypto' ? 'Crypto' : holding.asset_type === 'gold' ? 'Vàng' : holding.asset_type === 'bank' ? 'Tiết kiệm' : holding.asset_type === 'cash' ? 'Tiền mặt' : 'BĐS'}
                        </div>
                      </div>
                    </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-mono font-bold text-slate-700">
                      {holding.asset_type === 'bank' || holding.asset_type === 'cash'
                        ? formatCurrency(currency === 'VND' ? holding.totalAmount * exchangeRate : holding.totalAmount, currency)
                        : holding.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                    </div>
                    {holding.asset_type === 'bank' && holding.depositTx?.term > 0 && (
                      <div className={cn(
                        "text-[10px] font-bold",
                        holding.isMatured ? "text-rose-500" : "text-slate-400"
                      )}>
                        Kỳ hạn: {holding.depositTx.term} tháng {holding.isMatured && '(Đã đến hạn)'}
                      </div>
                    )}
                    {holding.asset_type === 'real_estate' && holding.loanCurrentValue > 0 && (
                      <div className="text-[10px] text-rose-500 font-bold">Dư nợ: {formatCurrency(currency === 'VND' ? holding.loanCurrentValue * exchangeRate : holding.loanCurrentValue, currency)}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-mono font-bold text-slate-700">
                      {holding.asset_type === 'bank'
                        ? `${holding.depositTx?.interest_rate || 0}% / năm`
                        : holding.asset_type === 'cash' 
                          ? '-' 
                          : holding.asset_type === 'real_estate'
                            ? formatCurrency(currency === 'VND' ? holding.totalInvested * exchangeRate : holding.totalInvested, currency)
                            : formatCurrency(currency === 'VND' ? (holding.totalInvested / holding.totalAmount) * exchangeRate : (holding.totalInvested / holding.totalAmount), currency)}
                    </div>
                  </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(currency === 'VND' ? holding.currentValue * exchangeRate : holding.currentValue, currency)}
                      </td>
                  <td className="px-6 py-4 text-right">
                    {holding.asset_type === 'bank' || holding.asset_type === 'cash' ? (
                      <div className="font-mono font-bold text-emerald-600">
                        {holding.asset_type === 'bank' ? `+${formatCurrency(currency === 'VND' ? pl * exchangeRate : pl, currency)}` : '-'}
                      </div>
                    ) : (
                          <div className="flex flex-col items-end">
                            <span className={cn(
                              "font-mono font-bold",
                              pl >= 0 ? "text-emerald-600" : "text-rose-600"
                            )}>
                              {pl >= 0 ? '+' : '-'}{formatCurrency(currency === 'VND' ? Math.abs(pl) * exchangeRate : Math.abs(pl), currency)}
                            </span>
                            <span className={cn(
                              "text-[10px] font-bold",
                              pl >= 0 ? "text-emerald-500" : "text-rose-500"
                            )}>
                              {pl >= 0 ? '+' : '-'}{Math.abs(plPercent).toFixed(2)}%
                            </span>
                          </div>
                        )}
                      </td>
                  <td className="px-6 py-4 text-right">
                    {holding.asset_type === 'bank' ? (
                      <button
                        onClick={() => handleSettleBankDeposit(holding.depositTx)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm",
                          holding.isMatured 
                            ? "bg-rose-500 hover:bg-rose-600 text-white" 
                            : "bg-emerald-50 hover:bg-emerald-100 text-emerald-600"
                        )}
                      >
                        Tất toán {holding.isMatured && 'ngay'}
                      </button>
                    ) : holding.asset_type === 'cash' ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setIsAdding(true);
                            setEditingId(null);
                            setFormData({
                              ...formData,
                              asset_type: 'cash',
                              asset_symbol: 'Tiền mặt',
                              transaction_type: 'deposit',
                              amount: '',
                              price_per_unit: '1',
                              currency: 'VND'
                            });
                          }}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-xs font-bold transition-colors"
                        >
                          Nạp tiền
                        </button>
                        <button
                          onClick={() => {
                            setIsAdding(true);
                            setEditingId(null);
                            setFormData({
                              ...formData,
                              asset_type: 'cash',
                              asset_symbol: 'Tiền mặt',
                              transaction_type: 'withdraw',
                              amount: '',
                              price_per_unit: '1',
                              currency: 'VND'
                            });
                          }}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold transition-colors"
                        >
                          Rút tiền
                        </button>
                      </div>
                    ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setIsAdding(true);
                                setEditingId(null);
                                setFormData({
                                  asset_type: holding.asset_type,
                                  asset_symbol: holding.asset_symbol,
                                  transaction_type: 'buy',
                                  amount: '',
                                  price_per_unit: '',
                                  interest_rate: '',
                                  term: '',
                                  date: new Date().toISOString().split('T')[0],
                                  currency: 'VND',
                                  status: 'active',
                                  linked_id: ''
                                });
                              }}
                              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold transition-colors"
                            >
                              Mua thêm
                            </button>
                            <button
                              onClick={() => {
                                setIsAdding(true);
                                setEditingId(null);
                                setFormData({
                                  asset_type: holding.asset_type,
                                  asset_symbol: holding.asset_symbol,
                                  transaction_type: 'sell',
                                  amount: '',
                                  price_per_unit: '',
                                  interest_rate: '',
                                  term: '',
                                  date: new Date().toISOString().split('T')[0],
                                  currency: 'VND',
                                  status: 'active',
                                  linked_id: ''
                                });
                              }}
                              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold transition-colors"
                            >
                              Bán
                            </button>
                            {holding.asset_type === 'real_estate' && (
                              <button
                                onClick={() => {
                                  setIsAdding(true);
                                  setEditingId(null);
                                  setFormData({
                                    asset_type: holding.asset_type,
                                    asset_symbol: holding.asset_symbol,
                                    transaction_type: 'repay',
                                    amount: '',
                                    price_per_unit: '',
                                    interest_rate: '',
                                    term: '',
                                    date: new Date().toISOString().split('T')[0],
                                    currency: 'VND',
                                    status: 'active',
                                    linked_id: ''
                                  });
                                }}
                                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold transition-colors"
                              >
                                Trả nợ
                              </button>
                            )}
                          </div>
                        )
                      }
                    </td>
                  </tr>
                );
              })
            )
          }
        </tbody>
          </table>
        </div>
      </div>

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
                <th className="px-6 py-4 text-right">Giá trị Giao dịch</th>
                <th className="px-6 py-4 text-right">Giá trị Hiện tại</th>
                <th className="px-6 py-4 text-right">Lợi nhuận</th>
                <th className="px-6 py-4 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center text-slate-400 italic font-medium">
                    Chưa có giao dịch nào. Hãy thêm giao dịch đầu tiên của bạn.
                  </td>
                </tr>
              ) : (
                transactions
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                  .map((t) => {
                  const currentValueInUsd = calculateCurrentValue(t);
                  const txCurrency = (t.currency || 'USD') as 'USD' | 'VND';
                  const displayCurrentValue = txCurrency === 'VND' ? currentValueInUsd * exchangeRate : currentValueInUsd;
                  
                  const amount = parseFloat(t.amount);
                  const originalPrice = parseFloat(t.price_per_unit);
                  const transactionValue = amount * originalPrice;
                  
                  let profitLoss = displayCurrentValue - transactionValue;
                  if (t.transaction_type === 'borrow') {
                    profitLoss = -profitLoss; // Interest on loan is a loss
                  } else if (t.transaction_type === 'repay') {
                    profitLoss = 0; // Repayment has no P/L
                  }
                  
                  const profitLossPercentage = transactionValue > 0 ? (profitLoss / transactionValue) * 100 : 0;
                  
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
                            {t.asset_type === 'crypto' ? 'Crypto' : t.asset_type === 'gold' ? 'Vàng' : t.asset_type === 'bank' ? 'Tiết kiệm' : 'Bất động sản'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                          (t.transaction_type === 'buy' || t.transaction_type === 'deposit' || t.transaction_type === 'repay') ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                        )}>
                          {t.transaction_type === 'deposit' ? 'Gửi' : 
                           t.transaction_type === 'withdraw' ? 'Rút' : 
                           t.transaction_type === 'borrow' ? 'Vay' :
                           t.transaction_type === 'repay' ? 'Trả nợ' :
                           t.transaction_type === 'buy' ? 'Mua' : 'Bán'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-slate-700">
                        {(t.asset_type === 'real_estate' && t.transaction_type !== 'borrow' && t.transaction_type !== 'repay') ? '-' : parseFloat(t.amount).toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 })}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-500 font-medium">
                        {(t.asset_type === 'bank' || t.transaction_type === 'borrow') ? `${t.interest_rate}%` : (t.transaction_type === 'repay' ? '-' : formatCurrency(displayPrice, t.currency as 'USD' | 'VND'))}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-slate-700">
                        {formatCurrency(transactionValue, t.currency as 'USD' | 'VND')}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(displayCurrentValue, t.currency as 'USD' | 'VND')}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold">
                        <div className={cn(
                          "flex flex-col items-end",
                          profitLoss >= 0 ? "text-emerald-600" : "text-rose-600"
                        )}>
                          <span>{profitLoss >= 0 ? '+' : ''}{formatCurrency(profitLoss, t.currency as 'USD' | 'VND')}</span>
                          <span className="text-[10px] opacity-80">{profitLoss >= 0 ? '+' : ''}{profitLossPercentage.toFixed(2)}%</span>
                        </div>
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
              )
            }
            </tbody>
          </table>
        </div>
        {transactions.length > itemsPerPage && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/30">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Trang {currentPage} / {Math.ceil(transactions.length / itemsPerPage)}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(transactions.length / itemsPerPage), prev + 1))}
                disabled={currentPage === Math.ceil(transactions.length / itemsPerPage)}
                className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-slate-200 p-6">
            <h3 className="font-bold text-lg text-slate-900 mb-2">{confirmModal.title}</h3>
            <p className="text-sm text-slate-500 mb-6">{confirmModal.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 text-sm font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-colors shadow-sm"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingHistoryAsset && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <History className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">Lịch sử giá: {viewingHistoryAsset.name}</h3>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">{viewingHistoryAsset.symbol}</p>
                </div>
              </div>
              <button 
                onClick={() => setViewingHistoryAsset(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <div className="space-y-4">
                {(() => {
                  try {
                    const history = JSON.parse(viewingHistoryAsset.price_history || '[]');
                    if (history.length === 0) return <p className="text-center text-slate-400 italic py-8">Chưa có lịch sử biến động giá.</p>;
                    
                    return [...history].reverse().map((entry: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ngày cập nhật</span>
                          <span className="text-sm font-medium text-slate-700">{new Date(entry.date).toLocaleString('vi-VN')}</span>
                        </div>
                        <div className="text-right flex flex-col">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Giá (USD)</span>
                          <span className="text-lg font-black text-slate-900">{formatCurrency(entry.price, 'USD')}</span>
                        </div>
                      </div>
                    ));
                  } catch (e) {
                    return <p className="text-center text-rose-500 py-8">Lỗi khi tải lịch sử giá.</p>;
                  }
                })()}
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100">
              <button 
                onClick={() => setViewingHistoryAsset(null)}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-2xl text-sm font-bold transition-all shadow-lg"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
          <h3 className="font-bold text-xl text-slate-900">{title}</h3>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
