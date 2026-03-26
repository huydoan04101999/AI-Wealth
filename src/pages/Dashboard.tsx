import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Activity, Coins, ShieldAlert, Wallet, TrendingUp, TrendingDown, DollarSign, Loader2, Sparkles, Building2, Landmark, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';
import { formatCurrency, formatCompactCurrency, calculateBankValue } from '../lib/format';
import Markdown from 'react-markdown';
import { callAI } from '../lib/ai';
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
}

interface MarketPrice {
  usd: number;
  usd_24h_change: number;
}

interface AssetHolding {
  symbol: string;
  amount: number;
  invested: number;
  avgPrice: number;
  currentPrice: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  type: string;
}

// Map common symbols to CoinGecko IDs
const SYMBOL_TO_ID: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'BNB': 'binancecoin',
  'USDT': 'tether',
};

// PIE_COLORS for charts
const PIE_COLORS = ['#4f46e5', '#eab308', '#06b6d4', '#ec4899', '#8b5cf6'];

export default function Dashboard() {
  const { fetchApi } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cashFlows, setCashFlows] = useState<any[]>([]);
  const [assetDefinitions, setAssetDefinitions] = useState<any[]>([]);
  const [marketPrices, setMarketPrices] = useState<Record<string, MarketPrice>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  
  // AI State
  const { openRouterApiKey, groqApiKey, tavilyApiKey, agents, exchangeRate } = useStore();
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string>('');

  // Update Price State
  const [editingPriceSymbol, setEditingPriceSymbol] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState<string>('');
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [txRes, assetsRes, cfRes] = await Promise.all([
          fetchApi('/api/portfolio/transactions'),
          fetchApi('/api/portfolio/assets'),
          fetchApi('/api/cashflow')
        ]);
        
        if (!txRes.ok) {
          const errData = await txRes.json().catch(() => ({}));
          if (errData.error === 'POSTGRES_URL is not configured.') {
            setDbError('missing_url');
          } else {
            setDbError(errData.error || 'Database connection error');
          }
        } else {
          setDbError(null);
        }

        let txData: Transaction[] = [];
        if (txRes.ok) {
          const text = await txRes.text();
          try {
            txData = JSON.parse(text);
            setTransactions(txData);
          } catch (e) {
            console.error(`Invalid JSON for transactions: ${txRes.status} ${txRes.statusText}`);
          }
        }

        if (cfRes.ok) {
          const text = await cfRes.text();
          try {
            setCashFlows(JSON.parse(text));
          } catch (e) {
            console.error(`Invalid JSON for cash flows`);
          }
        }

        let assetsData: any[] = [];
        if (assetsRes.ok) {
          const text = await assetsRes.text();
          try {
            assetsData = JSON.parse(text);
            setAssetDefinitions(assetsData);
          } catch (e) {
            console.error(`Invalid JSON for assets`);
          }
        }

        const cryptoSymbols = Array.from(new Set(
          txData.filter(tx => tx.asset_type === 'crypto').map(tx => tx.asset_symbol)
        ));
        
        if (cryptoSymbols.length === 0) cryptoSymbols.push('BTC', 'ETH');

        const ids = cryptoSymbols.map(sym => SYMBOL_TO_ID[sym] || sym.toLowerCase()).join(',');
        const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
        const priceData = await priceRes.json();
        
        const newPrices: Record<string, MarketPrice> = {};
        cryptoSymbols.forEach(sym => {
          const id = SYMBOL_TO_ID[sym] || sym.toLowerCase();
          if (priceData[id]) newPrices[sym] = priceData[id];
        });

        // Use prices from asset definitions for Gold and RE
        assetsData.forEach(asset => {
          newPrices[asset.symbol] = {
            usd: parseFloat(asset.current_price),
            usd_24h_change: 0
          };
        });

        setMarketPrices(newPrices);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Calculate Portfolio Metrics
  const holdingsMap: Record<string, AssetHolding & { transactions: Transaction[] }> = {};

  transactions.forEach(tx => {
    const amount = parseFloat(tx.amount);
    const price = parseFloat(tx.price_per_unit);
    const txCurrency = (tx as any).currency || 'USD';
    
    // Normalize to USD for internal calculations
    const valueInUsd = txCurrency === 'VND' ? (amount * price) / exchangeRate : (amount * price);
    const amountInAssetUnits = amount; // Amount is already in asset units (BTC, Lượng, etc.)
    
    // For bank, amount is the currency amount. If it's VND, we normalize it to USD.
    const normalizedAmount = (tx.asset_type === 'bank' && txCurrency === 'VND') 
      ? amount / exchangeRate 
      : amount;

    if (!holdingsMap[tx.asset_symbol]) {
      holdingsMap[tx.asset_symbol] = {
        symbol: tx.asset_symbol,
        amount: 0,
        invested: 0,
        avgPrice: 0,
        currentPrice: 0,
        currentValue: 0,
        pnl: 0,
        pnlPercent: 0,
        type: tx.asset_type,
        transactions: []
      };
    }

    const h = holdingsMap[tx.asset_symbol];
    h.transactions.push(tx);
    
    if (tx.transaction_type === 'buy' || tx.transaction_type === 'deposit') {
      h.amount += normalizedAmount;
      h.invested += valueInUsd;
    } else {
      h.amount -= normalizedAmount;
      h.invested -= valueInUsd;
    }
  });

  let totalInvested = 0;
  let totalCurrentValue = 0;
  let cryptoValue = 0;
  let goldValue = 0;
  let bankValue = 0;
  let realEstateValue = 0;

  // Separate totals for USD and VND
  let usdTotalInvested = 0;
  let usdTotalCurrentValue = 0;
  let vndTotalInvested = 0;
  let vndTotalCurrentValue = 0;

  const activeHoldings = Object.values(holdingsMap).filter(h => h.amount > 0).map(h => {
    if (h.type === 'bank') {
      // Calculate interest for bank deposits
      let totalInterestUsd = 0;
      const now = new Date();
      h.transactions.forEach(tx => {
        if (tx.transaction_type === 'deposit' && tx.interest_rate) {
          const txCurrency = (tx as any).currency || 'USD';
          const txAmount = parseFloat(tx.amount);
          const txAmountUsd = txCurrency === 'VND' ? txAmount / exchangeRate : txAmount;
          
          const txDate = new Date(tx.date);
          const daysPassed = (now.getTime() - txDate.getTime()) / (1000 * 3600 * 24);
          const interestUsd = txAmountUsd * (parseFloat(tx.interest_rate) / 100) * (daysPassed / 365);
          totalInterestUsd += interestUsd;
        }
      });
      h.currentPrice = 1; // 1 USD = 1 USD
      h.currentValue = h.amount + totalInterestUsd;
      h.avgPrice = 1;
      h.pnl = totalInterestUsd;
      h.pnlPercent = h.invested > 0 ? (totalInterestUsd / h.invested) * 100 : 0;
    } else {
      // For non-bank assets, try to get price from marketPrices or assetDefinitions
      // For Gold and Real Estate, always prioritize assetDefinitions
      if (h.type === 'gold' || h.type === 'real_estate') {
        const assetDef = assetDefinitions.find(a => a.symbol === h.symbol);
        if (assetDef) {
          h.currentPrice = parseFloat(assetDef.current_price) || 0;
        } else {
          const priceInfo = marketPrices[h.symbol];
          h.currentPrice = priceInfo?.usd || 0;
        }
      } else {
        const priceInfo = marketPrices[h.symbol];
        h.currentPrice = priceInfo?.usd || 0;
        
        // Fallback to asset definition price if not in marketPrices
        if (h.currentPrice === 0) {
          const assetDef = assetDefinitions.find(a => a.symbol === h.symbol);
          if (assetDef) {
            h.currentPrice = parseFloat(assetDef.current_price) || 0;
          }
        }
      }

      h.currentValue = h.amount * h.currentPrice;
      h.avgPrice = h.invested / h.amount;
      h.pnl = h.currentValue - h.invested;
      h.pnlPercent = h.invested > 0 ? (h.pnl / h.invested) * 100 : 0;
    }
    
    // For bank, fix display bug: show principal in avgPrice and currentPrice, hide amount
    if (h.type === 'bank') {
      h.avgPrice = h.invested; // Principal
      h.currentPrice = h.currentValue; // Principal + Interest
    }
    
    // All values here are in USD. We will convert for display later.
    totalInvested += h.invested;
    totalCurrentValue += h.currentValue;
    
    if (h.type === 'crypto') {
      cryptoValue += h.currentValue;
      usdTotalInvested += h.invested;
      usdTotalCurrentValue += h.currentValue;
    } else {
      if (h.type === 'gold') goldValue += h.currentValue;
      if (h.type === 'bank') bankValue += h.currentValue;
      if (h.type === 'real_estate') realEstateValue += h.currentValue;
      vndTotalInvested += h.invested;
      vndTotalCurrentValue += h.currentValue;
    }
    
    return h;
  });

  // Convert VND totals to VND for display
  const displayVndTotalInvested = vndTotalInvested * exchangeRate;
  const displayVndTotalCurrentValue = vndTotalCurrentValue * exchangeRate;
  const vndTotalPnl = vndTotalCurrentValue - vndTotalInvested;
  const displayVndTotalPnl = vndTotalPnl * exchangeRate;
  const vndTotalPnlPercent = vndTotalInvested > 0 ? (vndTotalPnl / vndTotalInvested) * 100 : 0;

  // USD totals (Crypto)
  const usdTotalPnl = usdTotalCurrentValue - usdTotalInvested;
  const usdTotalPnlPercent = usdTotalInvested > 0 ? (usdTotalPnl / usdTotalInvested) * 100 : 0;

  const totalPnl = totalCurrentValue - totalInvested;
  const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  const chartData = useMemo(() => {
    if (transactions.length === 0) return [];

    // Sort transactions by date
    const sortedTx = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const firstDate = new Date(sortedTx[0].date);
    const lastDate = new Date();
    
    const points = [];
    let currentDate = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    
    // Limit to last 12 months for better visualization if there are many months
    // But for now, let's show all.
    
    while (currentDate <= lastDate) {
      const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const label = currentDate.toLocaleString('vi-VN', { month: 'short' });
      
      let totalValueAtPoint = 0;
      const holdingsAtPoint: Record<string, { amount: number, lastPrice: number, type: string }> = {};
      
      sortedTx.forEach(tx => {
        const txDate = new Date(tx.date);
        if (txDate <= monthEnd) {
          if (!holdingsAtPoint[tx.asset_symbol]) {
            holdingsAtPoint[tx.asset_symbol] = { amount: 0, lastPrice: 0, type: tx.asset_type };
          }
          const amount = parseFloat(tx.amount);
          const price = parseFloat(tx.price_per_unit);
          const txCurrency = (tx as any).currency || 'USD';
          const priceInUsd = txCurrency === 'VND' ? price / exchangeRate : price;
          
          if (tx.transaction_type === 'buy' || tx.transaction_type === 'deposit') {
            holdingsAtPoint[tx.asset_symbol].amount += amount;
          } else {
            holdingsAtPoint[tx.asset_symbol].amount -= amount;
          }
          holdingsAtPoint[tx.asset_symbol].lastPrice = priceInUsd;
        }
      });
      
      const isCurrentMonth = currentDate.getMonth() === lastDate.getMonth() && currentDate.getFullYear() === lastDate.getFullYear();
      
      Object.entries(holdingsAtPoint).forEach(([symbol, h]) => {
        if (h.amount > 0) {
          let price = h.lastPrice;
          // For current month, use market prices if available
          if (isCurrentMonth && marketPrices[symbol]) {
            price = marketPrices[symbol].usd;
          }
          totalValueAtPoint += h.amount * price;
        }
      });
      
      // Always use VND for the overall growth chart as a common base
      const displayTotal = totalValueAtPoint * exchangeRate;
      points.push({ name: label, total: Math.round(displayTotal) });
      
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    // If only one point, add a previous zero point for better chart rendering
    if (points.length === 1) {
      return [{ name: '', total: 0 }, ...points];
    }
    
    return points;
  }, [transactions, marketPrices, exchangeRate]);

  const handleAnalyzePortfolio = async () => {
    if (!openRouterApiKey && !groqApiKey) {
      alert('Vui lòng cấu hình ít nhất một API Key (OpenRouter hoặc Groq) trong phần Cài đặt (Settings) trước.');
      return;
    }

    setIsAnalyzing(true);
    setAiAnalysis('');
    setAnalysisStep('Đang khởi tạo hội đồng chuyên gia...');

    const portfolioData = activeHoldings.map(h => {
      const isCrypto = h.type === 'crypto';
      const assetCurrency = isCrypto ? 'USD' : 'VND';
      const displayCurrentPrice = isCrypto ? h.currentPrice : h.currentPrice * exchangeRate;
      const displayCurrentValue = isCrypto ? h.currentValue : h.currentValue * exchangeRate;
      const displayAvgPrice = isCrypto ? h.avgPrice : h.avgPrice * exchangeRate;
      return `- ${h.symbol} (${h.type}): Số lượng ${h.amount.toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 })}, Giá vốn ${formatCurrency(displayAvgPrice, assetCurrency)}, Giá HT ${formatCurrency(displayCurrentPrice, assetCurrency)}, Tổng giá trị ${formatCurrency(displayCurrentValue, assetCurrency)}, Lời/Lỗ ${h.pnlPercent.toFixed(2)}%`;
    }).join('\n');

    const totalIncome = cashFlows.filter(cf => cf.type === 'income').reduce((sum, cf) => sum + parseFloat(cf.amount), 0);
    const totalExpense = cashFlows.filter(cf => cf.type === 'expense').reduce((sum, cf) => sum + parseFloat(cf.amount), 0);
    const netCashFlow = totalIncome - totalExpense;

    const baseContext = `
Dữ liệu tài chính hiện tại:
[DÒNG TIỀN THÁNG NÀY (VND)]
- Tổng thu nhập: ${formatCurrency(totalIncome, 'VND')}
- Tổng chi tiêu: ${formatCurrency(totalExpense, 'VND')}
- Dòng tiền ròng: ${formatCurrency(netCashFlow, 'VND')}

[DANH MỤC ĐẦU TƯ CRYPTO (USD)]
- Tổng giá trị: ${formatCurrency(usdTotalCurrentValue, 'USD')}
- Tổng vốn: ${formatCurrency(usdTotalInvested, 'USD')}
- Lợi nhuận: ${formatCurrency(usdTotalPnl, 'USD')} (${usdTotalPnlPercent.toFixed(2)}%)

[DANH MỤC TÀI SẢN VN (VND)]
- Tổng giá trị: ${formatCurrency(displayVndTotalCurrentValue, 'VND')}
- Tổng vốn: ${formatCurrency(displayVndTotalInvested, 'VND')}
- Lợi nhuận: ${formatCurrency(displayVndTotalPnl, 'VND')} (${vndTotalPnlPercent.toFixed(2)}%)

Tỷ trọng tài sản (theo giá trị quy đổi VND):
- Tiền mặt/Ngân hàng: ${totalCurrentValue > 0 ? ((bankValue / totalCurrentValue) * 100).toFixed(1) : 0}%
- Vàng: ${totalCurrentValue > 0 ? ((goldValue / totalCurrentValue) * 100).toFixed(1) : 0}%
- Crypto: ${totalCurrentValue > 0 ? ((usdTotalCurrentValue * exchangeRate / totalCurrentValue) * 100).toFixed(1) : 0}%
- Bất động sản: ${totalCurrentValue > 0 ? ((realEstateValue / totalCurrentValue) * 100).toFixed(1) : 0}%

Chi tiết tài sản:
${portfolioData}
`;

    try {
      // 1. Analysts Phase
      setAnalysisStep('Đang thu thập tin tức & dữ liệu vĩ mô...');
      const analysts = agents.filter(a => ['macro', 'crypto', 'news'].includes(a.id));
      const analystPromises = analysts.map(agent => {
        const apiKey = agent.provider === 'openrouter' ? openRouterApiKey : groqApiKey;
        return callAI(agent.provider as any, apiKey, agent.model, agent.systemPrompt, `${baseContext}\n\nHãy phân tích tình hình hiện tại và tổng hợp các tin tức tài chính/vĩ mô quan trọng nhất trong tuần qua dựa trên chuyên môn của bạn.`, tavilyApiKey)
          .then(content => ({ id: agent.id, name: agent.name, content }));
      });
      const analystResults = await Promise.all(analystPromises);

      // 2. Risk Manager Phase
      setAnalysisStep('Đang đánh giá rủi ro danh mục...');
      const riskAgent = agents.find(a => a.id === 'risk')!;
      const riskApiKey = riskAgent.provider === 'openrouter' ? openRouterApiKey : groqApiKey;
      const riskContext = `${baseContext}\n\nBáo cáo từ các chuyên viên:\n${analystResults.map(r => `[${r.name}]: ${r.content}`).join('\n\n')}\n\nHãy đánh giá các rủi ro tiềm ẩn đối với danh mục này trong bối cảnh vĩ mô hiện tại.`;
      const riskReport = await callAI(riskAgent.provider as any, riskApiKey, riskAgent.model, riskAgent.systemPrompt, riskContext, tavilyApiKey);

      // 3. CIO Phase (AI Wealth Advisor)
      setAnalysisStep('AI Wealth Advisor đang tổng hợp lời khuyên...');
      const cioAgent = agents.find(a => a.id === 'cio')!;
      const cioApiKey = cioAgent.provider === 'openrouter' ? openRouterApiKey : groqApiKey;
      
      const cioSystemPrompt = `Bạn là AI Wealth Advisor cá nhân của người dùng (xưng hô là "Sếp"). Bạn thông minh, nhạy bén, có chuyên môn sâu về tài chính và luôn đưa ra lời khuyên thực tế, trực diện.`;
      
      const cioContext = `
Dưới đây là dữ liệu tài chính của Sếp:
${baseContext}

Báo cáo từ các chuyên viên (Vĩ mô, Tin tức, Rủi ro):
${analystResults.map(r => `[${r.name}]: ${r.content}`).join('\n\n')}
[Quản trị rủi ro]: ${riskReport}

NHIỆM VỤ CỦA BẠN:
Hãy viết một báo cáo tư vấn gửi "Sếp" với cấu trúc sau:

1. Lời chào & Nhận xét nhanh (Giọng điệu tự nhiên, chuyên nghiệp):
Ví dụ: "Chào sếp, tháng này dòng tiền dương X nhưng tỷ trọng tiền mặt đang lên tới Y%. Trong bối cảnh lạm phát..., sếp có muốn xem xét..." (Dựa vào số liệu thực tế ở trên để nhận xét).

2. Tóm tắt Tin tức & Vĩ mô trong tuần:
Tóm tắt ngắn gọn các tin tức tài chính/vĩ mô quan trọng nhất từ báo cáo của các chuyên viên.

3. Đánh giá Tác động lên Danh mục:
Phân tích cụ thể những tin tức/vĩ mô đó ảnh hưởng thế nào đến các tài sản Sếp đang giữ (Crypto, Vàng, Tiền gửi...).

4. Hành động Đề xuất (Actionable Advice):
Đưa ra 2-3 gạch đầu dòng gợi ý hành động cụ thể (mua/bán/giữ/cơ cấu lại) dựa trên khẩu vị rủi ro và tình hình vĩ mô.

Lưu ý: Format bằng Markdown, sử dụng emoji phù hợp để báo cáo sinh động, dễ đọc. Không cần lặp lại toàn bộ số liệu, chỉ tập trung vào insight và lời khuyên.
`;
      const finalDecision = await callAI(cioAgent.provider as any, cioApiKey, cioAgent.model, cioSystemPrompt, cioContext, tavilyApiKey);

      setAiAnalysis(finalDecision);
    } catch (error: any) {
      console.error(error);
      setAiAnalysis(`**Lỗi:** Không thể hoàn thành phân tích đa tầng. ${error.message}`);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep('');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <p className="text-sm font-medium animate-pulse">Đang tải dữ liệu thị trường...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {dbError && (
        <div className={cn(
          "p-4 rounded-2xl border flex items-center justify-between gap-4 shadow-sm",
          dbError === 'missing_url' 
            ? "bg-amber-50 border-amber-200 text-amber-800" 
            : "bg-rose-50 border-rose-200 text-rose-800"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              dbError === 'missing_url' ? "bg-amber-100" : "bg-rose-100"
            )}>
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm">
                {dbError === 'missing_url' ? 'Chưa kết nối Database' : 'Lỗi kết nối Database'}
              </p>
              <p className="text-xs opacity-80 font-medium">
                {dbError === 'missing_url' 
                  ? 'Vui lòng cấu hình POSTGRES_URL trong phần Settings để lưu trữ dữ liệu.' 
                  : `Chi tiết: ${dbError}`}
              </p>
            </div>
          </div>
          <a href="/settings" className="px-4 py-2 bg-white border border-current rounded-xl text-xs font-bold hover:bg-white/50 transition-colors">Cấu hình ngay</a>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Báo cáo Đầu tư</h2>
          <p className="text-slate-500 mt-1 font-medium">Phân tích chi tiết hiệu suất danh mục và giá mua trung bình.</p>
        </div>
        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cập nhật lần cuối</p>
            <p className="text-sm font-mono font-bold text-slate-700">{new Date().toLocaleTimeString('vi-VN')}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
            <Activity className="w-4 h-4 text-slate-400" />
          </div>
        </div>
      </div>

      {/* USD Stats Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-6 bg-slate-900 rounded-full" />
          <h3 className="font-bold text-slate-900 uppercase tracking-widest text-xs">Danh mục Crypto (USD)</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                <Wallet className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tổng giá trị (USD)</span>
            </div>
            <div className="space-y-1">
              <h3 className="text-2xl font-bold tracking-tight text-slate-900">{formatCompactCurrency(usdTotalCurrentValue, 'USD')}</h3>
              <p className="text-xs font-medium text-slate-400">Giá trị thị trường Crypto hiện tại</p>
            </div>
          </div>

          <div className="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                <DollarSign className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vốn đầu tư (USD)</span>
            </div>
            <div className="space-y-1">
              <h3 className="text-2xl font-bold tracking-tight text-slate-900">{formatCompactCurrency(usdTotalInvested, 'USD')}</h3>
              <p className="text-xs font-medium text-slate-400">Tổng vốn Crypto đã giải ngân</p>
            </div>
          </div>

          <div className="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                usdTotalPnl >= 0 ? "bg-emerald-50 group-hover:bg-emerald-100" : "bg-rose-50 group-hover:bg-rose-100"
              )}>
                <Activity className={cn("w-5 h-5", usdTotalPnl >= 0 ? "text-emerald-600" : "text-rose-600")} />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lợi nhuận Crypto</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <h3 className={cn("text-2xl font-bold tracking-tight", usdTotalPnl >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  {usdTotalPnl >= 0 ? '+' : '-'}{formatCompactCurrency(Math.abs(usdTotalPnl), 'USD')}
                </h3>
                <span className={cn("flex items-center text-xs font-bold", usdTotalPnl >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  {usdTotalPnl >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(usdTotalPnlPercent).toFixed(2)}%
                </span>
              </div>
              <p className="text-xs font-medium text-slate-400">Tỷ lệ tăng trưởng Crypto</p>
            </div>
          </div>
        </div>
      </div>

      {/* VND Stats Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
          <h3 className="font-bold text-slate-900 uppercase tracking-widest text-xs">Danh mục Tài sản VN (VND)</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                <Wallet className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tổng giá trị (VND)</span>
            </div>
            <div className="space-y-1">
              <h3 className="text-2xl font-bold tracking-tight text-slate-900">{formatCompactCurrency(displayVndTotalCurrentValue, 'VND')}</h3>
              <p className="text-xs font-medium text-slate-400">Giá trị thị trường tài sản VN</p>
            </div>
          </div>

          <div className="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                <DollarSign className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vốn đầu tư (VND)</span>
            </div>
            <div className="space-y-1">
              <h3 className="text-2xl font-bold tracking-tight text-slate-900">{formatCompactCurrency(displayVndTotalInvested, 'VND')}</h3>
              <p className="text-xs font-medium text-slate-400">Tổng vốn VN đã giải ngân</p>
            </div>
          </div>

          <div className="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                vndTotalPnl >= 0 ? "bg-emerald-50 group-hover:bg-emerald-100" : "bg-rose-50 group-hover:bg-rose-100"
              )}>
                <Activity className={cn("w-5 h-5", vndTotalPnl >= 0 ? "text-emerald-600" : "text-rose-600")} />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lợi nhuận VN</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <h3 className={cn("text-2xl font-bold tracking-tight", vndTotalPnl >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  {vndTotalPnl >= 0 ? '+' : '-'}{formatCompactCurrency(Math.abs(displayVndTotalPnl), 'VND')}
                </h3>
                <span className={cn("flex items-center text-xs font-bold", vndTotalPnl >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  {vndTotalPnl >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(vndTotalPnlPercent).toFixed(2)}%
                </span>
              </div>
              <p className="text-xs font-medium text-slate-400">Tỷ lệ tăng trưởng tài sản VN</p>
            </div>
          </div>

          <div className="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phân bổ tổng thể</span>
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-900"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                </div>
              </div>
              
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-slate-500">Crypto (USD)</span>
                    <span className="text-slate-900">{totalCurrentValue > 0 ? ((usdTotalCurrentValue / totalCurrentValue) * 100).toFixed(1) : 0}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-slate-900 h-full rounded-full" style={{ width: `${totalCurrentValue > 0 ? (usdTotalCurrentValue / totalCurrentValue) * 100 : 0}%` }}></div>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-slate-500">Tài sản VN (VND)</span>
                    <span className="text-slate-900">{totalCurrentValue > 0 ? ((vndTotalCurrentValue / totalCurrentValue) * 100).toFixed(1) : 0}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${totalCurrentValue > 0 ? (vndTotalCurrentValue / totalCurrentValue) * 100 : 0}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Insights Section */}
      <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-100">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900">AI Wealth Advisor</h3>
              <p className="text-xs text-slate-500 font-medium tracking-tight">Phân tích danh mục & Gợi ý đầu tư từ chuyên gia AI</p>
            </div>
          </div>
          <button
            onClick={handleAnalyzePortfolio}
            disabled={isAnalyzing}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{analysisStep || 'Đang phân tích...'}</span>
              </>
            ) : (
              <>
                <Activity className="w-4 h-4" />
                <span>Nhận tư vấn từ AI</span>
              </>
            )}
          </button>
        </div>
        
        <div className={cn(
          "transition-all duration-500 ease-in-out",
          aiAnalysis ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        )}>
          {aiAnalysis && (
            <div className="p-4 sm:p-6 lg:p-8 bg-white">
              <div className="markdown-body prose prose-slate max-w-none">
                <Markdown>{aiAnalysis}</Markdown>
              </div>
            </div>
          )}
        </div>
        
        {!aiAnalysis && !isAnalyzing && (
          <div className="p-12 text-center bg-slate-50/20">
            <p className="text-sm text-slate-400 font-medium">Bấm nút phía trên để nhận phân tích từ AI về danh mục của bạn.</p>
          </div>
        )}
      </div>

      {/* Asset Performance Table */}
      <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
          <h3 className="font-bold text-lg text-slate-900">Hiệu suất từng tài sản</h3>
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <div className="w-2 h-2 rounded-full bg-slate-900" /> Crypto
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <div className="w-2 h-2 rounded-full bg-amber-500" /> Vàng VN
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <div className="w-2 h-2 rounded-full bg-emerald-500" /> Ngân hàng
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <div className="w-2 h-2 rounded-full bg-slate-400" /> BĐS
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] text-slate-400 bg-slate-50/50 border-b border-slate-100 uppercase tracking-widest font-bold">
              <tr>
                <th className="px-6 py-4">Tài sản</th>
                <th className="px-6 py-4 text-right">Số lượng</th>
                <th className="px-6 py-4 text-right">Giá vốn (Avg)</th>
                <th className="px-6 py-4 text-right">Giá hiện tại</th>
                <th className="px-6 py-4 text-right">Lời/Lỗ</th>
                <th className="px-6 py-4 text-right">Tỷ trọng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeHoldings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-slate-400 italic font-medium">
                    Chưa có dữ liệu tài sản. Hãy nhập giao dịch trong tab Portfolio.
                  </td>
                </tr>
              ) : (
                activeHoldings.map((h) => {
                  const isPositive = h.pnl >= 0;
                  const isGold = h.type === 'gold';
                  const isLocalGold = h.symbol === 'LOCAL_GOLD';
                  const isBank = h.type === 'bank';
                  const isRealEstate = h.type === 'real_estate';
                  
                  let typeColor = "bg-slate-900";
                  let typeBg = "bg-slate-50";
                  let typeBorder = "border-slate-100";
                  let typeText = "text-slate-600";
                  let typeLabel = "Cryptocurrency";
                  let Icon = Coins;

                  if (isGold) {
                    typeColor = "bg-amber-500";
                    typeBg = "bg-amber-50";
                    typeBorder = "border-amber-100";
                    typeText = "text-amber-600";
                    typeLabel = isLocalGold ? "Vàng tiệm địa phương" : "Vàng Việt Nam";
                  } else if (isBank) {
                    typeColor = "bg-emerald-500";
                    typeBg = "bg-emerald-50";
                    typeBorder = "border-emerald-100";
                    typeText = "text-emerald-600";
                    typeLabel = "Tiền gửi ngân hàng";
                    Icon = Landmark;
                  } else if (isRealEstate) {
                    typeColor = "bg-slate-400";
                    typeBg = "bg-slate-50";
                    typeBorder = "border-slate-100";
                    typeText = "text-slate-500";
                    typeLabel = "Bất động sản";
                    Icon = Building2;
                  }

                  return (
                    <tr key={h.symbol} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-[10px] border shadow-sm",
                            typeBg, typeBorder, typeText
                          )}>
                            {isBank || isRealEstate ? <Icon className="w-5 h-5" /> : h.symbol.substring(0, 4)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{h.symbol}</div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">{typeLabel}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-slate-700">
                        {isRealEstate || isBank ? '-' : h.amount.toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 })} <span className="text-[10px] text-slate-400 font-medium">{isGold ? 'Lượng' : ''}</span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-500 font-medium">
                        {formatCurrency(h.type === 'crypto' ? h.avgPrice : h.avgPrice * exchangeRate, h.type === 'crypto' ? 'USD' : 'VND')}
                      </td>
                      <td className="px-6 py-4 text-right font-mono">
                        <div className="font-bold text-slate-900 flex items-center justify-end gap-2">
                          {h.currentPrice > 0 ? formatCurrency(h.type === 'crypto' ? h.currentPrice : h.currentPrice * exchangeRate, h.type === 'crypto' ? 'USD' : 'VND') : 'N/A'}
                        </div>
                        {h.type === 'crypto' && h.currentPrice > 0 && (
                          <div className={cn("text-[10px] flex items-center justify-end font-bold", marketPrices[h.symbol]?.usd_24h_change >= 0 ? "text-emerald-600" : "text-rose-600")}>
                            {marketPrices[h.symbol]?.usd_24h_change >= 0 ? '+' : ''}{marketPrices[h.symbol]?.usd_24h_change?.toFixed(2) || '0.00'}%
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className={cn("font-bold font-mono", isPositive ? "text-emerald-600" : "text-rose-600")}>
                          {isPositive ? '+' : '-'}{formatCurrency(h.type === 'crypto' ? Math.abs(h.pnl) : Math.abs(h.pnl) * exchangeRate, h.type === 'crypto' ? 'USD' : 'VND')}
                        </div>
                        <div className={cn("text-[10px] font-bold", isPositive ? "text-emerald-500" : "text-rose-500")}>
                          {isPositive ? '+' : ''}{h.pnlPercent.toFixed(2)}%
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="text-xs font-bold text-slate-900">
                          {((h.currentValue / totalCurrentValue) * 100).toFixed(1)}%
                        </div>
                        <div className="w-16 bg-slate-100 h-1 rounded-full ml-auto mt-2 overflow-hidden">
                          <div 
                            className={cn("h-full rounded-full", typeColor)} 
                            style={{ width: `${(h.currentValue / totalCurrentValue) * 100}%` }} 
                          />
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

      {/* Market Sentiment & Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 p-4 sm:p-6 lg:p-8 rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="font-bold text-lg text-slate-900">Tăng trưởng tài sản</h3>
              <p className="text-xs text-slate-400 font-medium">Biến động tổng giá trị danh mục theo thời gian</p>
            </div>
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">Tổng giá trị (VND)</span>
            </div>
          </div>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} fontWeight={600} tickLine={false} axisLine={false} tick={{ dy: 10 }} />
                <YAxis stroke="#94a3b8" fontSize={10} fontWeight={600} tickLine={false} axisLine={false} tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)', padding: '12px' }}
                  itemStyle={{ color: '#0f172a', fontSize: '12px', fontWeight: 'bold' }}
                  labelStyle={{ color: '#64748b', fontSize: '10px', fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase' }}
                  formatter={(value: any) => formatCurrency(value, 'VND')}
                />
                <Area type="monotone" dataKey="total" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-1 p-4 sm:p-6 lg:p-8 rounded-3xl border border-slate-200 bg-white shadow-sm">
          <h3 className="font-bold text-lg text-slate-900 mb-2">Phân bổ chi tiết</h3>
          <p className="text-xs text-slate-400 font-medium mb-8">Tỷ trọng các loại tài sản trong danh mục</p>
          <div className="h-[220px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={activeHoldings.map(h => ({ name: h.symbol, value: h.type === 'crypto' ? h.currentValue * exchangeRate : h.currentValue * exchangeRate }))}
                  cx="50%" cy="50%" innerRadius={65} outerRadius={90} paddingAngle={6} dataKey="value" stroke="none"
                >
                  {activeHoldings.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  formatter={(value: number) => formatCurrency(value, 'VND')}
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Đa dạng</span>
              <span className="text-xl font-bold text-slate-900">{activeHoldings.length}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tài sản</span>
            </div>
          </div>
          <div className="mt-8 space-y-3">
            {activeHoldings.map((h, index) => (
              <div key={h.symbol} className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                  <span className="text-xs text-slate-600 font-bold group-hover:text-slate-900 transition-colors">{h.symbol}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">{((h.currentValue / totalCurrentValue) * 100).toFixed(1)}%</span>
                  <div className="w-12 h-1 bg-slate-50 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length], width: `${(h.currentValue / totalCurrentValue) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
