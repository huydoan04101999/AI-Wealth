import React, { useState, useRef, useEffect } from 'react';
import { Send, User, BrainCircuit, ShieldAlert, LineChart, PieChart, Newspaper, Briefcase, AlertTriangle, Loader2, KeyRound, Plus, Trash2, TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';
import { ChatMessage, ChatSession } from '../store/useStore';
import { callAI } from '../lib/ai';
import Markdown from 'react-markdown';

const AGENT_ICONS: Record<string, React.ElementType> = {
  cio: Briefcase,
  macro: LineChart,
  crypto: PieChart,
  risk: ShieldAlert,
  news: Newspaper,
};

export default function WarRoom() {
  const { openRouterApiKey, groqApiKey, tavilyApiKey, agents, chatSessions, addChatSession, updateChatSession, deleteChatSession } = useStore();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isDiscussing, setIsDiscussing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentSession = chatSessions.find(s => s.id === currentSessionId);
  const messages = currentSession?.messages || [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const startNewSession = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: 'Cuộc họp mới',
      messages: [],
      date: new Date().toISOString()
    };
    addChatSession(newSession);
    setCurrentSessionId(newId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isDiscussing) return;
    if (!openRouterApiKey && !groqApiKey) {
      alert('Vui lòng cấu hình ít nhất một API Key (OpenRouter hoặc Groq) trong phần Cài đặt.');
      return;
    }

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = Date.now().toString();
      const newSession: ChatSession = {
        id: sessionId,
        title: input.trim().substring(0, 30) + (input.length > 30 ? '...' : ''),
        messages: [],
        date: new Date().toISOString()
      };
      addChatSession(newSession);
      setCurrentSessionId(sessionId);
    }

    const topic = input.trim();
    setInput('');
    setIsDiscussing(true);

    const userMsg: ChatMessage = { 
      id: Date.now().toString(), 
      type: 'user', 
      content: topic, 
      status: 'done',
      timestamp: Date.now()
    };
    
    const updatedMessages = [...messages, userMsg];
    updateChatSession(sessionId, updatedMessages);

    try {
      // 1. Analysts Phase
      const analysts = agents.filter(a => ['macro', 'crypto', 'news'].includes(a.id));
      
      const analystPromises = analysts.map(async (agent) => {
        const msgId = `msg-${agent.id}-${Date.now()}`;
        const thinkingMsg: ChatMessage = { 
          id: msgId, 
          type: 'agent', 
          agentId: agent.id, 
          agentName: agent.name, 
          content: '', 
          status: 'thinking',
          timestamp: Date.now()
        };
        
        // We need to get the latest messages from the store or use a ref/callback
        // For simplicity in this edit, we'll use a local variable to track the state
        // but in a real app we'd use a more robust way to update state.
        
        try {
          const apiKey = agent.provider === 'openrouter' ? openRouterApiKey : groqApiKey;
          const content = await callAI(agent.provider as any, apiKey, agent.model, agent.systemPrompt, `User question: ${topic}`, tavilyApiKey);
          return { agentId: agent.id, agentName: agent.name, content, status: 'done' as const };
        } catch (error: any) {
          return { agentId: agent.id, agentName: agent.name, content: error.message, status: 'error' as const };
        }
      });

      const analystResults = await Promise.all(analystPromises);
      
      const newAnalystMessages: ChatMessage[] = analystResults.map(r => ({
        id: `msg-${r.agentId}-${Date.now()}`,
        type: 'agent',
        agentId: r.agentId,
        agentName: r.agentName,
        content: r.content,
        status: r.status,
        timestamp: Date.now()
      }));

      const afterAnalystMessages = [...updatedMessages, ...newAnalystMessages];
      updateChatSession(sessionId, afterAnalystMessages);

      // 2. Risk Manager Phase
      const riskAgent = agents.find(a => a.id === 'risk')!;
      const riskMsgId = `msg-risk-${Date.now()}`;
      
      const riskContext = `User question: ${topic}\n\nAnalysts Reports:\n${analystResults.map(r => `[${r.agentId.toUpperCase()}]: ${r.content}`).join('\n\n')}\n\nPlease evaluate the risks of these reports.`;
      
      try {
        const riskApiKey = riskAgent.provider === 'openrouter' ? openRouterApiKey : groqApiKey;
        const riskContent = await callAI(riskAgent.provider as any, riskApiKey, riskAgent.model, riskAgent.systemPrompt, riskContext, tavilyApiKey);
        const riskMsg: ChatMessage = {
          id: riskMsgId,
          type: 'agent',
          agentId: riskAgent.id,
          agentName: riskAgent.name,
          content: riskContent,
          status: 'done',
          timestamp: Date.now()
        };
        const afterRiskMessages = [...afterAnalystMessages, riskMsg];
        updateChatSession(sessionId, afterRiskMessages);

        // 3. CIO Phase
        const cioAgent = agents.find(a => a.id === 'cio')!;
        const cioMsgId = `msg-cio-${Date.now()}`;
        const cioContext = `User question: ${topic}\n\nAnalysts Reports:\n${analystResults.map(r => `[${r.agentId.toUpperCase()}]: ${r.content}`).join('\n\n')}\n\nRisk Manager Report:\n${riskContent}\n\nAs the CIO, make the final allocation decision and explain why.`;
        
        const cioApiKey = cioAgent.provider === 'openrouter' ? openRouterApiKey : groqApiKey;
        const cioContent = await callAI(cioAgent.provider as any, cioApiKey, cioAgent.model, cioAgent.systemPrompt, cioContext, tavilyApiKey);
        const cioMsg: ChatMessage = {
          id: cioMsgId,
          type: 'agent',
          agentId: cioAgent.id,
          agentName: cioAgent.name,
          content: cioContent,
          status: 'done',
          timestamp: Date.now()
        };
        updateChatSession(sessionId, [...afterRiskMessages, cioMsg]);
      } catch (error: any) {
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          type: 'agent',
          content: error.message,
          status: 'error',
          timestamp: Date.now()
        };
        updateChatSession(sessionId, [...afterAnalystMessages, errorMsg]);
      }

    } catch (error) {
      console.error("War Room Error:", error);
    } finally {
      setIsDiscussing(false);
    }
  };

  // Group sessions by date
  const groupedSessions = chatSessions.reduce((groups: Record<string, ChatSession[]>, session) => {
    const date = new Date(session.date).toLocaleDateString('vi-VN');
    if (!groups[date]) groups[date] = [];
    groups[date].push(session);
    return groups;
  }, {});

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-7xl mx-auto gap-4 lg:gap-6 pb-4 lg:pb-6">
      <div className="flex flex-col lg:flex-row flex-1 gap-4 lg:gap-6 min-h-0">
        {/* Sidebar */}
        <div className="w-full lg:w-72 flex flex-col gap-4 shrink-0 h-48 lg:h-auto border-b lg:border-b-0 border-slate-200 pb-4 lg:pb-0">
        <button
          onClick={startNewSession}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-2xl text-sm font-bold transition-all shadow-lg shadow-emerald-100"
        >
          <Plus className="w-4 h-4" />
          Cuộc họp mới
        </button>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
          {Object.entries(groupedSessions).map(([date, sessions]) => (
            <div key={date} className="space-y-2">
              <h4 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold px-3">{date}</h4>
              <div className="space-y-1">
                {sessions.map((session) => (
                  <div key={session.id} className="group relative">
                    <button
                      onClick={() => setCurrentSessionId(session.id)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all truncate pr-10 border border-transparent font-medium",
                        currentSessionId === session.id 
                          ? "bg-white text-slate-900 border-slate-200 shadow-sm" 
                          : "text-slate-500 hover:bg-white/50 hover:text-slate-900"
                      )}
                    >
                      {session.title}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Bạn có chắc chắn muốn xóa cuộc thảo luận này?')) {
                          deleteChatSession(session.id);
                          if (currentSessionId === session.id) setCurrentSessionId(null);
                        }
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-rose-500 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white rounded-2xl lg:rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
        <div className="flex-1 overflow-y-auto space-y-6 lg:space-y-8 p-4 lg:p-8 scroll-smooth custom-scrollbar bg-slate-50/30">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6 opacity-40">
              <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center">
                <BrainCircuit className="w-10 h-10 text-slate-400" />
              </div>
              <div className="space-y-2">
                <p className="text-slate-900 font-bold text-lg">Hội đồng cố vấn AI</p>
                <p className="text-slate-500 max-w-xs text-sm font-medium">
                  {currentSessionId ? 'Bắt đầu cuộc thảo luận bằng cách nhập câu hỏi bên dưới.' : 'Chọn một cuộc họp hoặc bắt đầu cuộc họp mới.'}
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.type === 'user';
              const isCIO = msg.agentId === 'cio';
              const Icon = msg.agentId ? AGENT_ICONS[msg.agentId] || BrainCircuit : User;

              return (
                <div key={msg.id} className={cn(
                  "flex gap-3 lg:gap-5 p-4 lg:p-6 rounded-2xl lg:rounded-[2rem] transition-all animate-in fade-in slide-in-from-bottom-4",
                  isUser ? "bg-slate-100/80 ml-4 lg:ml-16 border border-slate-200/50" : "mr-4 lg:mr-16 bg-white border border-slate-200 shadow-sm",
                  isCIO ? "bg-emerald-50/50 border-emerald-200 shadow-emerald-100/50" : ""
                )}>
                  <div className={cn(
                    "w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                    isUser ? "bg-white text-slate-600" : "bg-slate-50 border border-slate-200 text-slate-400",
                    isCIO ? "bg-emerald-600 border-emerald-500 text-white shadow-emerald-200" : ""
                  )}>
                    <Icon className="w-5 h-5 lg:w-6 lg:h-6" />
                  </div>
                  <div className="flex-1 space-y-3 overflow-hidden">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-sm text-slate-900">
                        {isUser ? 'Bạn' : msg.agentName}
                      </span>
                      {msg.status === 'thinking' && (
                        <span className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-bold uppercase tracking-widest">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Đang phân tích...
                        </span>
                      )}
                      {msg.status === 'error' && (
                        <span className="flex items-center gap-1.5 text-[10px] text-rose-500 font-bold uppercase tracking-widest">
                          <AlertTriangle className="w-3 h-3" />
                          Lỗi kết nối
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 font-bold ml-auto">
                        {new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    
                    {msg.content && (
                      <div className="markdown-body prose prose-slate prose-sm max-w-none">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 lg:p-6 bg-white border-t border-slate-100">
          <form onSubmit={handleSubmit} className="relative flex items-end gap-3">
            <div className="relative flex-1">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="Nhập câu hỏi hoặc tình huống đầu tư..."
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-4 lg:pl-5 pr-12 lg:pr-14 py-3 lg:py-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 resize-none min-h-[52px] lg:min-h-[60px] max-h-[200px] transition-all font-medium text-slate-900"
                rows={1}
                disabled={isDiscussing || !currentSessionId}
              />
              <button
                type="submit"
                disabled={!input.trim() || isDiscussing || !currentSessionId}
                className="absolute right-1.5 lg:right-2 bottom-1.5 lg:bottom-2 w-10 h-10 lg:w-11 lg:h-11 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl flex items-center justify-center transition-all shadow-lg shadow-slate-200"
              >
                {isDiscussing ? <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 animate-spin" /> : <Send className="w-4 h-4 lg:w-5 lg:h-5" />}
              </button>
            </div>
          </form>
          <p className="mt-3 text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest px-2">
            Hội đồng AI có thể đưa ra thông tin không chính xác. Hãy luôn kiểm chứng trước khi đầu tư.
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
