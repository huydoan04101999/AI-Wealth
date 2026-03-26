import { useStore } from '../store/useStore';
import { Save, Key, Bot, RefreshCw, Loader2, Globe, DollarSign } from 'lucide-react';
import { useState, useEffect } from 'react';
import { parseInputNumber } from '../lib/format';

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
}

export default function Settings() {
  const { 
    openRouterApiKey, setOpenRouterApiKey, 
    groqApiKey, setGroqApiKey, 
    tavilyApiKey, setTavilyApiKey,
    agents, updateAgent,
    exchangeRate, setExchangeRate
  } = useStore();
  
  const [openRouterInput, setOpenRouterInput] = useState(openRouterApiKey);
  const [groqInput, setGroqInput] = useState(groqApiKey);
  const [tavilyInput, setTavilyInput] = useState(tavilyApiKey);
  const [rateInput, setRateInput] = useState(exchangeRate.toString());
  
  const [isSavedOR, setIsSavedOR] = useState(false);
  const [isSavedGroq, setIsSavedGroq] = useState(false);
  const [isSavedTavily, setIsSavedTavily] = useState(false);
  const [isSavedRate, setIsSavedRate] = useState(false);
  
  const [availableModels, setAvailableModels] = useState<OpenRouterModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isFetchingRate, setIsFetchingRate] = useState(false);

  useEffect(() => {
    const fetchOpenRouterModels = async () => {
      setIsLoadingModels(true);
      try {
        const res = await fetch('https://openrouter.ai/api/v1/models');
        const data = await res.json();
        const sortedModels = data.data.sort((a: OpenRouterModel, b: OpenRouterModel) => 
          a.name.localeCompare(b.name)
        );
        setAvailableModels(sortedModels);
      } catch (error) {
        console.error("Failed to fetch OpenRouter models:", error);
      } finally {
        setIsLoadingModels(false);
      }
    };

    fetchOpenRouterModels();
  }, []);

  const handleSaveOpenRouterKey = () => {
    setOpenRouterApiKey(openRouterInput);
    setIsSavedOR(true);
    setTimeout(() => setIsSavedOR(false), 2000);
  };

  const handleSaveGroqKey = () => {
    setGroqApiKey(groqInput);
    setIsSavedGroq(true);
    setTimeout(() => setIsSavedGroq(false), 2000);
  };

  const handleSaveTavilyKey = () => {
    setTavilyApiKey(tavilyInput);
    setIsSavedTavily(true);
    setTimeout(() => setIsSavedTavily(false), 2000);
  };

  const handleSaveRate = () => {
    const val = parseFloat(parseInputNumber(rateInput));
    if (!isNaN(val)) {
      setExchangeRate(val);
      setIsSavedRate(true);
      setTimeout(() => setIsSavedRate(false), 2000);
    }
  };

  const fetchAutoRate = async () => {
    setIsFetchingRate(true);
    try {
      // Using a public API for exchange rates
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await res.json();
      if (data.rates && data.rates.VND) {
        setRateInput(data.rates.VND.toString());
        setExchangeRate(data.rates.VND);
        setIsSavedRate(true);
        setTimeout(() => setIsSavedRate(false), 2000);
      }
    } catch (error) {
      console.error("Failed to fetch exchange rate:", error);
      alert("Không thể lấy tỷ giá tự động. Vui lòng nhập thủ công.");
    } finally {
      setIsFetchingRate(false);
    }
  };

  const handleResetPrompt = (agentId: string) => {
    const defaults: Record<string, string> = {
      cio: "Bạn là Giám đốc Đầu tư (CIO) của một quỹ quản lý tài sản cá nhân tại Việt Nam. Nhiệm vụ của bạn là lắng nghe báo cáo từ các chuyên viên phân tích, tổng hợp thông tin, và đưa ra quyết định phân bổ vốn (DCA) cuối cùng cho danh mục đa tài sản (Crypto, Vàng SJC/Nhẫn, Bất động sản Việt Nam, Tiền gửi ngân hàng nội địa). Hãy luôn giải thích ngắn gọn, logic và dứt khoát, bám sát tình hình kinh tế Việt Nam. Luôn sử dụng công cụ tìm kiếm để cập nhật các chỉ số kinh tế mới nhất trước khi đưa ra lời khuyên.",
      macro: "Bạn là Chuyên viên Phân tích Vĩ mô tập trung vào thị trường Việt Nam. Nhiệm vụ của bạn là phân tích các chỉ số kinh tế (CPI, GDP, lãi suất điều hành của NHNN), tỷ giá USD/VND, chính sách của Chính phủ và các sự kiện địa chính trị để dự báo xu hướng dòng tiền lớn, tác động lên các lớp tài sản tại Việt Nam. BẮT BUỘC sử dụng công cụ tìm kiếm để lấy các chỉ số CPI, lãi suất, tỷ giá mới nhất hôm nay, không được tự bịa số liệu.",
      crypto: "Bạn là Chuyên viên Phân tích Tài sản tại Việt Nam. Nhiệm vụ của bạn là đánh giá chu kỳ của từng lớp tài sản (Bất động sản Việt Nam, Vàng miếng SJC, Vàng nhẫn, Crypto, Tiền gửi tiết kiệm). Phân tích dòng tiền, định giá, dữ liệu thị trường (on-chain cho crypto, cung cầu cho BĐS/Vàng nội địa) để đề xuất chiến lược phân bổ và luân chuyển vốn hiệu quả. Luôn tìm kiếm giá vàng SJC, giá Bitcoin và các tài sản khác theo thời gian thực.",
      risk: "Bạn là Chuyên viên Quản trị Rủi ro tại Việt Nam. Nhiệm vụ của bạn là tìm ra những điểm yếu trong kế hoạch đầu tư, đánh giá rủi ro thanh khoản (BĐS Việt Nam), rủi ro biến động (Crypto), rủi ro lạm phát và tỷ giá (VND). Bạn luôn ưu tiên bảo vệ vốn, đa dạng hóa danh mục và đề xuất tỷ trọng an toàn phù hợp với tâm lý nhà đầu tư Việt. Sử dụng tìm kiếm để cập nhật các rủi ro vĩ mô mới nhất.",
      news: "Bạn là Chuyên viên Phân tích Tâm lý Thị trường Việt Nam. Nhiệm vụ của bạn là tổng hợp tin tức từ báo chí Việt Nam, chính sách nhà nước, và mạng xã hội (Facebook, Telegram) để đánh giá tâm lý đám đông (FOMO/FUD) đối với các kênh đầu tư (Sốt đất, đổ xô mua Vàng, đu đỉnh Crypto). Phát hiện các rủi ro tiềm ẩn từ tin đồn và sự kiện bất ngờ tại thị trường nội địa bằng cách tìm kiếm các tin tức nóng hổi nhất trong 24h qua."
    };
    
    if (defaults[agentId]) {
      updateAgent(agentId, { systemPrompt: defaults[agentId] });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-12">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Cấu hình Hệ thống</h2>
        <p className="text-slate-500 mt-1 font-medium">Quản lý API Key, Tỷ giá và tùy chỉnh đội ngũ AI của bạn.</p>
      </div>

      {/* Exchange Rate Section */}
      <section className="p-8 rounded-3xl border border-slate-200 bg-white shadow-sm space-y-6">
        <div className="flex items-center gap-3 text-lg font-bold text-slate-900 border-b border-slate-100 pb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Globe className="w-5 h-5 text-emerald-600" />
          </div>
          <h3>Tỷ giá USD/VND</h3>
        </div>
        <div className="flex flex-col md:flex-row gap-6 items-end">
          <div className="flex-1 space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tỷ giá hiện tại (1 USD = ? VND)</label>
            <div className="relative">
              <input
                type="text"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all"
              />
              <DollarSign className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button
              onClick={fetchAutoRate}
              disabled={isFetchingRate}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            >
              {isFetchingRate ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Lấy tỷ giá tự động
            </button>
            <button
              onClick={handleSaveRate}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-100"
            >
              <Save className="w-4 h-4" />
              {isSavedRate ? 'Đã lưu' : 'Lưu'}
            </button>
          </div>
        </div>
      </section>

      {/* API Key Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <section className="space-y-6 p-8 rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 text-lg font-bold text-slate-900 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Key className="w-5 h-5 text-emerald-600" />
            </div>
            <h3>OpenRouter API Key</h3>
          </div>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            Dùng cho các model mạnh như Claude 3.5 Sonnet, GPT-4o.
          </p>
          <div className="space-y-4">
            <input
              type="password"
              value={openRouterInput}
              onChange={(e) => setOpenRouterInput(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all"
            />
            <button
              onClick={handleSaveOpenRouterKey}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-100"
            >
              <Save className="w-4 h-4" />
              {isSavedOR ? 'Đã lưu' : 'Lưu OpenRouter Key'}
            </button>
          </div>
        </section>

        <section className="space-y-6 p-8 rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 text-lg font-bold text-slate-900 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Key className="w-5 h-5 text-amber-600" />
            </div>
            <h3>Groq API Key</h3>
          </div>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            Dùng cho các model mã nguồn mở tốc độ cực nhanh (Llama 3, Mixtral).
          </p>
          <div className="space-y-4">
            <input
              type="password"
              value={groqInput}
              onChange={(e) => setGroqInput(e.target.value)}
              placeholder="gsk_..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 transition-all"
            />
            <button
              onClick={handleSaveGroqKey}
              className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-amber-100"
            >
              <Save className="w-4 h-4" />
              {isSavedGroq ? 'Đã lưu' : 'Lưu Groq Key'}
            </button>
          </div>
        </section>

        <section className="space-y-6 p-8 rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 text-lg font-bold text-slate-900 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Globe className="w-5 h-5 text-blue-600" />
            </div>
            <h3>Tavily API Key</h3>
          </div>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            Dùng để AI có thể tìm kiếm thông tin thực tế từ Internet (Giá vàng, lãi suất...).
          </p>
          <div className="space-y-4">
            <input
              type="password"
              value={tavilyInput}
              onChange={(e) => setTavilyInput(e.target.value)}
              placeholder="tvly-..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
            />
            <button
              onClick={handleSaveTavilyKey}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-100"
            >
              <Save className="w-4 h-4" />
              {isSavedTavily ? 'Đã lưu' : 'Lưu Tavily Key'}
            </button>
          </div>
        </section>
      </div>

      {/* Agents Configuration */}
      <section className="space-y-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3 text-xl font-bold text-slate-900">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <h3>Cấu hình Đội ngũ AI (Agents)</h3>
          </div>
          {isLoadingModels && (
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <Loader2 className="w-3 h-3 animate-spin" />
              Đang tải Models...
            </div>
          )}
        </div>
        <p className="text-sm text-slate-500 font-medium">
          Tùy chỉnh Model và System Prompt cho từng chuyên viên trong đội ngũ của bạn.
        </p>

        <div className="space-y-8">
          {agents.map((agent) => (
            <div key={agent.id} className="p-8 rounded-[2rem] border border-slate-200 bg-white shadow-sm space-y-6 hover:shadow-md transition-all">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-lg font-bold text-slate-900">{agent.name}</h4>
                  <p className="text-xs text-slate-500 font-medium mt-1">{agent.description}</p>
                </div>
                <div className="text-[10px] font-bold bg-slate-100 px-3 py-1.5 rounded-lg text-slate-500 uppercase tracking-widest">
                  {agent.role}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="col-span-1 space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Provider</label>
                    <select
                      value={agent.provider}
                      onChange={(e) => {
                        const provider = e.target.value as 'openrouter' | 'groq';
                        const defaultModel = provider === 'openrouter' 
                          ? 'anthropic/claude-3.5-sonnet' 
                          : 'llama-3.3-70b-versatile';
                        updateAgent(agent.id, { provider, model: defaultModel });
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:border-emerald-500 transition-all"
                    >
                      <option value="openrouter">OpenRouter</option>
                      <option value="groq">Groq</option>
                    </select>
                </div>

                <div className="col-span-1 space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Model ID</label>
                  {agent.provider === 'openrouter' ? (
                    <div className="space-y-3">
                      <select
                        value={availableModels.some(m => m.id === agent.model) ? agent.model : 'custom'}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val !== 'custom') {
                            updateAgent(agent.id, { model: val });
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:border-emerald-500 transition-all"
                        disabled={isLoadingModels}
                      >
                        {availableModels.length > 0 ? (
                          availableModels.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.name}
                            </option>
                          ))
                        ) : (
                          <option value={agent.model}>{agent.model}</option>
                        )}
                        <option value="custom">-- Nhập model ID tùy chỉnh --</option>
                      </select>

                      {(!availableModels.some(m => m.id === agent.model) || agent.model === 'custom') && (
                        <input
                          type="text"
                          value={agent.model === 'custom' ? '' : agent.model}
                          onChange={(e) => updateAgent(agent.id, { model: e.target.value })}
                          placeholder="Nhập Model ID (vd: openai/gpt-4o)"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 transition-all"
                        />
                      )}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={agent.model}
                      onChange={(e) => updateAgent(agent.id, { model: e.target.value })}
                      placeholder="Nhập Groq Model ID (vd: llama-3.3-70b-versatile)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  )}
                </div>
                
                <div className="col-span-1 md:col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Prompt</label>
                    <button 
                      onClick={() => handleResetPrompt(agent.id)}
                      className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1.5 transition-all uppercase tracking-widest"
                      title="Khôi phục Prompt mặc định"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Reset
                    </button>
                  </div>
                  <textarea
                    value={agent.systemPrompt}
                    onChange={(e) => updateAgent(agent.id, { systemPrompt: e.target.value })}
                    rows={4}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:border-emerald-500 transition-all resize-none leading-relaxed"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
