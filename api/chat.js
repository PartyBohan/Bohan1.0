// Vercel Edge Function: proxy for OpenAI / DeepSeek Chat
export const config = { runtime: 'edge' };

const PROVIDERS = {
  openai:   { url: 'https://api.openai.com/v1/chat/completions', envKey: 'OPENAI_API_KEY' },
  deepseek: { url: 'https://api.deepseek.com/chat/completions',  envKey: 'DEEPSEEK_API_KEY' }
};

export default async function handler(req) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { 'Content-Type': 'application/json', ...cors } });

  try {
    const body = await req.json();
    if (body.max_tokens > 500) body.max_tokens = 500;

    // Determine provider from request or default to openai
    const providerName = body._provider || 'openai';
    delete body._provider;
    const provider = PROVIDERS[providerName] || PROVIDERS.openai;

    const apiKey = process.env[provider.envKey] || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: `Server missing ${provider.envKey}` }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
    }

    const response = await fetch(provider.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), { status: response.status, headers: { 'Content-Type': 'application/json', ...cors } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'chat proxy error: ' + e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }
}
