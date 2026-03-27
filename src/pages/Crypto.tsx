import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, DollarSign, Activity, 
  BrainCircuit, Target, AlertCircle, Clock, 
  ArrowRightLeft, Bot, LineChart as LineChartIcon,
  Zap, ShieldAlert, Info, Crown, ChevronUp, ChevronDown,
  Calendar, RefreshCcw, Bitcoin
} from 'lucide-react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Bar, Cell, ErrorBar
} from 'recharts';
import { cn } from '../lib/utils';

interface ChartDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  isUp: boolean;
  range: [number, number];
  wick: [number, number];
}

export default function Crypto() {
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'dca'>('overview');
  const [timeframe, setTimeframe] = useState<'1' | '7' | '30' | '365'>('7');
  const [btcData, setBtcData] = useState<{
    price: number;
    change24h: number;
    marketCap: number;
    volume24h: number;
    high24h: number;
    low24h: number;
  } | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async (retryCount = 0) => {
      try {
        if (retryCount === 0) setLoading(true);
        
        // Fetch current price and 24h stats via proxy
        const priceRes = await fetch('/api/crypto/btc/stats');
        if (!priceRes.ok) throw new Error(`Failed to fetch price: ${priceRes.status}`);
        const priceJson = await priceRes.json();
        
        const marketData = priceJson.market_data;
        setBtcData({
          price: marketData.current_price.usd,
          change24h: marketData.price_change_percentage_24h,
          marketCap: marketData.market_cap.usd,
          volume24h: marketData.total_volume.usd,
          high24h: marketData.high_24h.usd,
          low24h: marketData.low_24h.usd,
        });

        // Fetch OHLC data via proxy
        const ohlcRes = await fetch(`/api/crypto/btc/ohlc?timeframe=${timeframe}`);
        if (!ohlcRes.ok) throw new Error(`Failed to fetch OHLC data: ${ohlcRes.status}`);
        const ohlcJson = await ohlcRes.json();
        
        const formattedData: ChartDataPoint[] = ohlcJson.map((item: any) => {
          const [time, open, high, low, close] = item;
          const date = new Date(time);
          return {
            date: timeframe === '1' 
              ? date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
              : date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
            open,
            high,
            low,
            close,
            isUp: close >= open,
            range: [open, close],
            wick: [low, high]
          };
        });

        setChartData(formattedData);
        setError(null);
      } catch (err) {
        console.error('Error fetching BTC data:', err);
        if (retryCount < 2) {
          console.log(`Retrying fetch... attempt ${retryCount + 1}`);
          setTimeout(() => fetchData(retryCount + 1), 2000);
        } else {
          setError('Không thể tải dữ liệu thị trường thực tế. Vui lòng kiểm tra kết nối mạng hoặc thử lại sau.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(() => fetchData(), 60000);
    return () => clearInterval(interval);
  }, [timeframe]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  };

  const formatCompact = (value: number) => {
    return new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(value);
  };

  if (loading && !btcData) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium animate-pulse">Đang kết nối dữ liệu Bitcoin thực tế...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-red-900 mb-2">Lỗi kết nối dữ liệu</h2>
        <p className="text-red-700 mb-6">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-xl shadow-orange-200/50 border border-orange-300/30">
              <Bitcoin className="w-8 h-8 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
              <BrainCircuit className="w-3 h-3 text-white" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">BTC Intelligence</h1>
              <span className="px-2 py-0.5 rounded-md bg-slate-900 text-[10px] font-bold text-white uppercase tracking-widest">v2.0</span>
            </div>
            <p className="text-slate-500 text-sm mt-0.5 flex items-center gap-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Market Node
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1">
                <RefreshCcw className="w-3 h-3" />
                Auto-sync
              </span>
            </p>
          </div>
        </div>
        
        <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              activeTab === 'overview' ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            Tổng quan
          </button>
          <button
            onClick={() => setActiveTab('agents')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2",
              activeTab === 'agents' ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <BrainCircuit className="w-4 h-4" />
            AI Agents
          </button>
          <button
            onClick={() => setActiveTab('dca')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2",
              activeTab === 'dca' ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <Target className="w-4 h-4" />
            Chiến lược DCA
          </button>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-500">Giá BTC Hiện tại</h3>
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-orange-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{formatCurrency(btcData?.price || 0)}</div>
          <div className="mt-2 flex items-center text-sm">
            <div className={cn(
              "flex items-center font-medium",
              (btcData?.change24h || 0) >= 0 ? "text-emerald-600" : "text-red-600"
            )}>
              {(btcData?.change24h || 0) >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
              {Math.abs(btcData?.change24h || 0).toFixed(2)}%
            </div>
            <span className="text-slate-400 ml-2">24h qua</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-500">Vốn hóa (Market Cap)</h3>
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Activity className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">${formatCompact(btcData?.marketCap || 0)}</div>
          <div className="mt-2 flex items-center text-sm">
            <span className="text-slate-500">Vol 24h: ${formatCompact(btcData?.volume24h || 0)}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-500">Biên độ 24h</h3>
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <ArrowRightLeft className="w-4 h-4 text-purple-600" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] text-slate-400 flex justify-between font-bold uppercase">
              <span>Low: {formatCurrency(btcData?.low24h || 0)}</span>
              <span>High: {formatCurrency(btcData?.high24h || 0)}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
              <div 
                className="bg-purple-500 h-full rounded-full transition-all duration-1000" 
                style={{ 
                  width: `${((btcData?.price || 0) - (btcData?.low24h || 0)) / ((btcData?.high24h || 0) - (btcData?.low24h || 0)) * 100}%` 
                }}
              ></div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-500">Chỉ báo AI ({timeframe === '1' ? '24h' : timeframe === '7' ? '7D' : timeframe === '30' ? '1M' : '1Y'})</h3>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <BrainCircuit className="w-4 h-4 text-indigo-600" />
            </div>
          </div>
          <div className={cn(
            "text-2xl font-bold flex items-center gap-2",
            chartData.length > 0 && chartData[chartData.length - 1].close >= chartData[0].open ? "text-emerald-600" : "text-red-600"
          )}>
            {chartData.length > 0 && chartData[chartData.length - 1].close >= chartData[0].open ? (
              <>
                <ChevronUp className="w-6 h-6" />
                TĂNG GIÁ
              </>
            ) : (
              <>
                <ChevronDown className="w-6 h-6" />
                GIẢM GIÁ
              </>
            )}
          </div>
          <div className="mt-2 flex items-center text-sm">
            <span className="text-slate-500">Xu hướng {timeframe === '1' ? 'trong ngày' : timeframe === '7' ? 'tuần' : timeframe === '30' ? 'tháng' : 'năm'}: </span>
            <span className={cn(
              "font-bold ml-1",
              chartData.length > 0 && chartData[chartData.length - 1].close >= chartData[0].open ? "text-emerald-600" : "text-red-600"
            )}>
              {chartData.length > 0 ? (
                ((chartData[chartData.length - 1].close - chartData[0].open) / chartData[0].open * 100).toFixed(2) + '%'
              ) : '0%'}
            </span>
          </div>
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart Section */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <LineChartIcon className="w-5 h-5 text-slate-400" />
                  Biểu đồ Nến Bitcoin
                </h2>
                <p className="text-xs text-slate-500 mt-1">Dữ liệu OHLC thời gian thực</p>
              </div>
              <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
                {[
                  { label: '1D', value: '1' },
                  { label: '1W', value: '7' },
                  { label: '1M', value: '30' },
                  { label: '1Y', value: '365' }
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTimeframe(opt.value as any)}
                    className={cn(
                      "px-3 py-1 rounded-md text-[10px] font-bold transition-all",
                      timeframe === opt.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    dy={10}
                    minTickGap={30}
                  />
                  <YAxis 
                    domain={['auto', 'auto']}
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    tickFormatter={(value) => `$${value / 1000}k`}
                    dx={-10}
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as ChartDataPoint;
                        return (
                          <div className="bg-white p-4 border border-slate-200 shadow-xl rounded-xl min-w-[160px]">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 border-b border-slate-100 pb-1">{data.date}</p>
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Mở:</span>
                                <span className="font-bold text-slate-900">{formatCurrency(data.open)}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Cao:</span>
                                <span className="font-bold text-emerald-600">{formatCurrency(data.high)}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Thấp:</span>
                                <span className="font-bold text-red-600">{formatCurrency(data.low)}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Đóng:</span>
                                <span className="font-bold text-slate-900">{formatCurrency(data.close)}</span>
                              </div>
                            </div>
                            <div className={cn(
                              "mt-3 pt-2 border-t border-slate-100 flex items-center justify-center gap-1 text-[10px] font-bold uppercase",
                              data.isUp ? "text-emerald-600" : "text-red-600"
                            )}>
                              {data.isUp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              {data.isUp ? "Tăng trưởng" : "Giảm giá"}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {/* Wick */}
                  <Bar dataKey="wick" barSize={1} fill="#94a3b8">
                    {chartData.map((entry, index) => (
                      <Cell key={`wick-${index}`} fill={entry.isUp ? "#10b981" : "#ef4444"} />
                    ))}
                  </Bar>
                  {/* Body */}
                  <Bar dataKey="range" barSize={12}>
                    {chartData.map((entry, index) => (
                      <Cell key={`body-${index}`} fill={entry.isUp ? "#10b981" : "#ef4444"} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI Sentiment Card */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                Tâm lý Thị trường
              </h2>
              
              <div className="space-y-6">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium text-slate-600">Fear & Greed Index</span>
                    <span className="text-sm font-bold text-orange-600">75 (Tham lam)</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div className="bg-gradient-to-r from-emerald-500 via-amber-500 to-orange-600 h-2 rounded-full" style={{ width: '75%' }}></div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Tín hiệu Tích cực</h4>
                      <p className="text-xs text-slate-500 mt-1">Lượng BTC trên các sàn tiếp tục giảm, cho thấy áp lực bán yếu.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                      <TrendingDown className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Rủi ro ngắn hạn</h4>
                      <p className="text-xs text-slate-500 mt-1">Chỉ số RSI khung ngày đang ở mức cao, có thể có nhịp điều chỉnh kỹ thuật.</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <button className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                    <Bot className="w-4 h-4" />
                    Hỏi AI về Bitcoin
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200">
              <h3 className="font-bold mb-2 flex items-center gap-2 text-sm">
                <Info className="w-4 h-4" />
                Dự báo Chiến lược
              </h3>
              <p className="text-xs text-indigo-100 leading-relaxed">
                Bitcoin đang trong giai đoạn "Price Discovery" sau Halving. AI dự báo BTC sẽ dẫn dắt thị trường trong 3-6 tháng tới. Ưu tiên nắm giữ và chỉ chốt lời khi đạt các mốc Fibonacci quan trọng trên $100k.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'agents' && (
        <div className="space-y-6">
          <div className="bg-indigo-900 rounded-2xl p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600 rounded-full opacity-20 blur-3xl -mr-20 -mt-20"></div>
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-purple-500 rounded-full opacity-20 blur-3xl -ml-10 -mb-10"></div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <Bot className="w-8 h-8 text-indigo-300" />
                <h2 className="text-2xl font-bold">Bitcoin AI Multi-Agent System</h2>
              </div>
              <p className="text-indigo-200 max-w-2xl">
                Hệ thống AI chuyên biệt phân tích Bitcoin từ dữ liệu On-chain, Kinh tế vĩ mô và Phân tích kỹ thuật thời gian thực.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Supreme Commander Agent */}
            <div className="md:col-span-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl border border-slate-800 shadow-2xl p-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -mr-48 -mt-48 transition-all group-hover:bg-indigo-500/20"></div>
              
              <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                <div className="shrink-0">
                  <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-indigo-500/40 border border-indigo-400/30 relative">
                    <Crown className="w-12 h-12 text-white" />
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center border-4 border-slate-900">
                      <Zap className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 text-center md:text-left">
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-3">
                    <h3 className="text-2xl font-black text-white tracking-tight uppercase">Supreme Commander</h3>
                    <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-widest border border-indigo-500/30">Decision Maker</span>
                  </div>
                  <p className="text-slate-400 text-sm leading-relaxed max-w-3xl">
                    "Sau khi tổng hợp dữ liệu từ các Agent chuyên biệt, tôi xác nhận Bitcoin đang trong chu kỳ tích lũy cuối cùng trước khi bứt phá. Tín hiệu On-chain mạnh mẽ kết hợp với bối cảnh vĩ mô thuận lợi cho thấy xác suất tăng trưởng lên $85,000 trong 30 ngày tới là 89%. Khuyến nghị: Duy trì vị thế Long và tích lũy thêm tại các nhịp điều chỉnh nhẹ."
                  </p>
                </div>

                <div className="shrink-0 bg-white/5 rounded-2xl p-6 border border-white/10 backdrop-blur-sm min-w-[200px]">
                  <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4">Final Verdict</div>
                  <div className="flex items-center gap-3 text-emerald-400 mb-2">
                    <TrendingUp className="w-6 h-6" />
                    <span className="text-2xl font-black uppercase tracking-tighter">Strong Buy</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-bold">Confidence Score: 94.8%</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">On-chain Specialist</h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">Phân tích mạng lưới Bitcoin</p>
                </div>
                <div className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
                  ACTIVE
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Insight mới nhất</h4>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    "Lượng BTC được rút khỏi các sàn giao dịch tăng mạnh. Các ví cá voi đang tích lũy thêm 25,000 BTC trong 48 giờ qua. Đây là tín hiệu cực kỳ lạc quan cho xu hướng dài hạn."
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Khuyến nghị</div>
                    <div className="font-bold text-sm text-emerald-600 uppercase">Gom hàng mạnh</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Độ tin cậy</div>
                    <div className="font-bold text-sm text-slate-900">92%</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Macro Strategist</h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">Phân tích Kinh tế vĩ mô</p>
                </div>
                <div className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
                  ACTIVE
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Insight mới nhất</h4>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    "Chỉ số lạm phát hạ nhiệt củng cố khả năng FED cắt giảm lãi suất. Bitcoin đang được xem là 'Vàng kỹ thuật' trong bối cảnh bất ổn địa chính trị toàn cầu."
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Khuyến nghị</div>
                    <div className="font-bold text-sm text-indigo-600 uppercase">Nắm giữ (HODL)</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Độ tin cậy</div>
                    <div className="font-bold text-sm text-slate-900">88%</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Technical Master</h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">Phân tích Kỹ thuật nâng cao</p>
                </div>
                <div className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">
                  WARNING
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Insight mới nhất</h4>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    "BTC đang gặp kháng cự mạnh tại vùng đỉnh cũ. Có thể xuất hiện nhịp 'Shakeout' để thanh lý các lệnh Long đòn bẩy cao trước khi bứt phá lên mốc $80,000."
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Khuyến nghị</div>
                    <div className="font-bold text-sm text-amber-600 uppercase">Cẩn trọng</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Độ tin cậy</div>
                    <div className="font-bold text-sm text-slate-900">81%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'dca' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                  <Target className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Chiến lược DCA Bitcoin Thực tế</h2>
                  <p className="text-sm text-slate-500">Tối ưu hóa điểm vào lệnh dựa trên giá thực tế và biến động AI</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Vùng mua đề xuất</h4>
                    <div className="space-y-3">
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-700">Vùng 1 (An toàn)</span>
                        <span className="font-bold text-emerald-700">{formatCurrency((btcData?.price || 0) * 0.9)} - {formatCurrency((btcData?.price || 0) * 0.95)}</span>
                      </div>
                      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-700">Vùng 2 (Trung bình)</span>
                        <span className="font-bold text-blue-700">{formatCurrency((btcData?.price || 0) * 0.96)} - {formatCurrency((btcData?.price || 0) * 0.98)}</span>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex justify-between items-center opacity-60">
                        <span className="text-sm font-medium text-slate-700">Vùng 3 (Giá hiện tại)</span>
                        <span className="font-bold text-slate-700">{formatCurrency(btcData?.price || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                  <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    Tại sao nên DCA Bitcoin?
                  </h4>
                  <ul className="space-y-4">
                    <li className="flex gap-3 text-sm text-slate-600">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</div>
                      <span>Giảm thiểu rủi ro tâm lý khi thị trường biến động mạnh.</span>
                    </li>
                    <li className="flex gap-3 text-sm text-slate-600">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</div>
                      <span>Tối ưu hóa giá vốn trung bình trong dài hạn.</span>
                    </li>
                    <li className="flex gap-3 text-sm text-slate-600">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</div>
                      <span>Phù hợp với chu kỳ tăng trưởng 4 năm của Bitcoin.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 text-white h-fit">
            <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              Quản trị Rủi ro
            </h3>
            
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                <div className="text-xs text-slate-400 uppercase font-bold mb-2">Mức cắt lỗ (Stop Loss)</div>
                <div className="text-xl font-bold text-red-400">{formatCurrency((btcData?.price || 0) * 0.85)}</div>
                <p className="text-[10px] text-slate-500 mt-1">Dưới vùng hỗ trợ cứng 30 ngày.</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                <div className="text-xs text-slate-400 uppercase font-bold mb-2">Mục tiêu (Take Profit)</div>
                <div className="text-xl font-bold text-emerald-400">$100,000 - $120,000</div>
                <p className="text-[10px] text-slate-500 mt-1">Dự báo đỉnh chu kỳ hiện tại.</p>
              </div>

              <div className="pt-4">
                <div className="flex items-center gap-2 text-amber-400 mb-2">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase">Lưu ý</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Bitcoin là tài sản biến động cao. Chỉ nên đầu tư số vốn bạn có thể chấp nhận mất. Chiến lược DCA này được thiết kế cho tầm nhìn 12-24 tháng.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BitcoinIcon({ className }: { className?: string }) {
  return (
    <Bitcoin className={className} />
  );
}
