
export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export async function searchTavily(query: string, apiKey: string): Promise<string> {
  if (!apiKey) return "No search results (Tavily API Key missing).";

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: "advanced",
        include_answer: true,
        max_results: 5,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Tavily Search Error:", errorData);
      return `Search failed: ${errorData.detail || response.statusText}`;
    }

    const data = await response.json();
    
    let resultText = `Search results for: "${query}"\n\n`;
    if (data.answer) {
      resultText += `Summary: ${data.answer}\n\n`;
    }

    data.results.forEach((res: SearchResult, index: number) => {
      resultText += `[${index + 1}] ${res.title}\nURL: ${res.url}\nContent: ${res.content}\n\n`;
    });

    return resultText;
  } catch (error) {
    console.error("Tavily Search Exception:", error);
    return "Search failed due to a network error.";
  }
}

export async function callAI(
  provider: 'openrouter' | 'groq',
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  tavilyApiKey?: string
) {
  let finalUserPrompt = userPrompt;

  // If Tavily API Key is provided, we perform a search to augment the prompt
  // We only search if the system prompt or user prompt suggests a need for fresh data
  const needsSearch = /giá|tin tức|mới nhất|hôm nay|tỷ giá|cập nhật|lãi suất|biến động|thị trường/i.test(userPrompt + systemPrompt);

  if (tavilyApiKey && needsSearch) {
    // Extract a search query from the user prompt or just use the user prompt
    // For simplicity, we'll use the user prompt but cleaned up a bit
    const searchQuery = userPrompt.length > 200 ? userPrompt.substring(0, 200) : userPrompt;
    const searchResults = await searchTavily(searchQuery, tavilyApiKey);
    
    finalUserPrompt = `
[KẾT QUẢ TÌM KIẾM THỜI GIAN THỰC]
${searchResults}

[YÊU CẦU CỦA NGƯỜI DÙNG]
${userPrompt}

Lưu ý: Hãy sử dụng thông tin từ kết quả tìm kiếm trên để trả lời chính xác nhất. Nếu thông tin tìm kiếm không liên quan, hãy dựa vào kiến thức của bạn nhưng vẫn ưu tiên dữ liệu mới nhất.
`;
  }

  const baseUrl = provider === 'openrouter' 
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : 'https://api.groq.com/openai/v1/chat/completions';

  if (!apiKey) throw new Error(`Thiếu API Key cho ${provider === 'openrouter' ? 'OpenRouter' : 'Groq'}`);

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...(provider === 'openrouter' && {
        'HTTP-Referer': window.location.origin,
        'X-Title': 'AI Wealth Team',
      })
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: finalUserPrompt }
      ]
    })
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `Lỗi kết nối ${provider} API`);
  }
  
  const data = await res.json();
  return data.choices[0].message.content;
}
