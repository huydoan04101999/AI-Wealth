import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface ChatMessage {
  id: string;
  type: 'user' | 'agent';
  agentId?: string;
  agentName?: string;
  content: string;
  status: 'thinking' | 'done' | 'error';
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  date: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  provider: 'openrouter' | 'groq';
  model: string;
  systemPrompt: string;
  description: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
}

interface AppState {
  openRouterApiKey: string;
  setOpenRouterApiKey: (key: string) => void;
  groqApiKey: string;
  setGroqApiKey: (key: string) => void;
  tavilyApiKey: string;
  setTavilyApiKey: (key: string) => void;
  agents: AgentConfig[];
  updateAgent: (id: string, updates: Partial<AgentConfig>) => void;
  currency: 'USD' | 'VND';
  setCurrency: (currency: 'USD' | 'VND') => void;
  exchangeRate: number;
  setExchangeRate: (rate: number) => void;
  chatSessions: ChatSession[];
  addChatSession: (session: ChatSession) => void;
  updateChatSession: (id: string, messages: ChatMessage[]) => void;
  deleteChatSession: (id: string) => void;
  clearStore: () => void;
  loadSettingsFromFirestore: () => Promise<void>;
  saveSettingsToFirestore: () => Promise<void>;
}

const defaultAgents: AgentConfig[] = [
  {
    id: 'cio',
    name: 'CIO',
    role: 'Giám đốc Đầu tư',
    description: 'Người ra quyết định cuối cùng, tổng hợp ý kiến từ team.',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    systemPrompt: 'Bạn là Giám đốc Đầu tư (CIO) của một quỹ quản lý tài sản cá nhân tại Việt Nam. Nhiệm vụ của bạn là lắng nghe báo cáo từ các chuyên viên phân tích, tổng hợp thông tin, và đưa ra quyết định phân bổ vốn (DCA) cuối cùng cho danh mục đa tài sản (Crypto, Vàng SJC/Nhẫn, Bất động sản Việt Nam, Tiền gửi ngân hàng nội địa). Hãy luôn giải thích ngắn gọn, logic và dứt khoát, bám sát tình hình kinh tế Việt Nam. Luôn sử dụng công cụ tìm kiếm để cập nhật các chỉ số kinh tế mới nhất trước khi đưa ra lời khuyên.'
  },
  {
    id: 'macro',
    name: 'Macro Analyst',
    role: 'Chuyên viên Vĩ mô',
    description: 'Phân tích kinh tế vĩ mô, lãi suất, lạm phát, chính sách tiền tệ.',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    systemPrompt: 'Bạn là Chuyên viên Phân tích Vĩ mô tập trung vào thị trường Việt Nam. Nhiệm vụ của bạn là phân tích các chỉ số kinh tế (CPI, GDP, lãi suất điều hành của NHNN), tỷ giá USD/VND, chính sách của Chính phủ và các sự kiện địa chính trị để dự báo xu hướng dòng tiền lớn, tác động lên các lớp tài sản tại Việt Nam. BẮT BUỘC sử dụng công cụ tìm kiếm để lấy các chỉ số CPI, lãi suất, tỷ giá mới nhất hôm nay, không được tự bịa số liệu.'
  },
  {
    id: 'crypto',
    name: 'Asset Class Analyst',
    role: 'Chuyên viên Phân tích Tài sản',
    description: 'Phân tích chuyên sâu từng lớp tài sản: BĐS, Vàng, Crypto, Lãi suất.',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    systemPrompt: 'Bạn là Chuyên viên Phân tích Tài sản tại Việt Nam. Nhiệm vụ của bạn là đánh giá chu kỳ của từng lớp tài sản (Bất động sản Việt Nam, Vàng miếng SJC, Vàng nhẫn, Crypto, Tiền gửi tiết kiệm). Phân tích dòng tiền, định giá, dữ liệu thị trường (on-chain cho crypto, cung cầu cho BĐS/Vàng nội địa) để đề xuất chiến lược phân bổ và luân chuyển vốn hiệu quả. Luôn tìm kiếm giá vàng SJC, giá Bitcoin và các tài sản khác theo thời gian thực.'
  },
  {
    id: 'risk',
    name: 'Risk Manager',
    role: 'Quản trị Rủi ro',
    description: 'Đóng vai trò phản biện, cảnh báo rủi ro, bảo vệ vốn.',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    systemPrompt: 'Bạn là Chuyên viên Quản trị Rủi ro tại Việt Nam. Nhiệm vụ của bạn là tìm ra những điểm yếu trong kế hoạch đầu tư, đánh giá rủi ro thanh khoản (BĐS Việt Nam), rủi ro biến động (Crypto), rủi ro lạm phát và tỷ giá (VND). Bạn luôn ưu tiên bảo vệ vốn, đa dạng hóa danh mục và đề xuất tỷ trọng an toàn phù hợp với tâm lý nhà đầu tư Việt. Sử dụng tìm kiếm để cập nhật các rủi ro vĩ mô mới nhất.'
  },
  {
    id: 'news',
    name: 'Market Sentiment Analyst',
    role: 'Chuyên viên Tâm lý Thị trường',
    description: 'Quét tin tức, chính sách, mạng xã hội để đo lường tâm lý đám đông.',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    systemPrompt: 'Bạn là Chuyên viên Phân tích Tâm lý Thị trường Việt Nam. Nhiệm vụ của bạn là tổng hợp tin tức từ báo chí Việt Nam, chính sách nhà nước, và mạng xã hội (Facebook, Telegram) để đánh giá tâm lý đám đông (FOMO/FUD) đối với các kênh đầu tư (Sốt đất, đổ xô mua Vàng, đu đỉnh Crypto). Phát hiện các rủi ro tiềm ẩn từ tin đồn và sự kiện bất ngờ tại thị trường nội địa bằng cách tìm kiếm các tin tức nóng hổi nhất trong 24h qua.'
  }
];

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      openRouterApiKey: '',
      setOpenRouterApiKey: (key) => set({ openRouterApiKey: key }),
      groqApiKey: '',
      setGroqApiKey: (key) => set({ groqApiKey: key }),
      tavilyApiKey: '',
      setTavilyApiKey: (key) => set({ tavilyApiKey: key }),
      agents: defaultAgents,
      updateAgent: (id, updates) => set((state) => ({
        agents: state.agents.map((agent) => 
          agent.id === id ? { ...agent, ...updates } : agent
        )
      })),
      currency: 'VND',
      setCurrency: (currency) => set({ currency }),
      exchangeRate: 25000,
      setExchangeRate: (rate) => set({ exchangeRate: rate }),
      chatSessions: [],
      addChatSession: (session) => set((state) => ({
        chatSessions: [session, ...state.chatSessions]
      })),
      updateChatSession: (id, messages) => set((state) => ({
        chatSessions: state.chatSessions.map((s) => 
          s.id === id ? { ...s, messages } : s
        )
      })),
      deleteChatSession: (id) => set((state) => ({
        chatSessions: state.chatSessions.filter((s) => s.id !== id)
      })),
      clearStore: () => set({
        openRouterApiKey: '',
        groqApiKey: '',
        tavilyApiKey: '',
        agents: defaultAgents,
        chatSessions: []
      }),
      loadSettingsFromFirestore: async () => {
        const user = auth.currentUser;
        if (!user) return;
        
        try {
          const docRef = doc(db, 'users', user.uid, 'settings', 'config');
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            set({
              openRouterApiKey: data.openRouterApiKey || '',
              groqApiKey: data.groqApiKey || '',
              tavilyApiKey: data.tavilyApiKey || '',
              exchangeRate: data.exchangeRate || 25000,
              currency: data.currency || 'VND',
              agents: data.agents || defaultAgents,
            });
          }
        } catch (error) {
          console.error("Error loading settings from Firestore:", error);
        }
      },
      saveSettingsToFirestore: async () => {
        const user = auth.currentUser;
        if (!user) return;
        
        const state = useStore.getState();
        try {
          const docRef = doc(db, 'users', user.uid, 'settings', 'config');
          await setDoc(docRef, {
            openRouterApiKey: state.openRouterApiKey,
            groqApiKey: state.groqApiKey,
            tavilyApiKey: state.tavilyApiKey,
            exchangeRate: state.exchangeRate,
            currency: state.currency,
            agents: state.agents,
            updatedAt: new Date().toISOString()
          });
        } catch (error) {
          console.error("Error saving settings to Firestore:", error);
          throw error;
        }
      },
    }),
    {
      name: 'ai-wealth-team-storage',
    }
  )
);
