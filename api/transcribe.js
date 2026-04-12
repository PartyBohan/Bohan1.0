// Vercel Serverless Function: proxy OpenAI Whisper STT
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server missing OPENAI_API_KEY' });

  try {
    const { audio, filename, model } = req.body || {};
    if (!audio) return res.status(400).json({ error: 'Missing audio data in body' });

    const audioBuffer = Buffer.from(audio, 'base64');

    // Use FormData (available in Node 18+)
    const { FormData, Blob } = await import('node:buffer').then(() => globalThis).catch(() => globalThis);

    const form = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/webm' });
    form.append('file', blob, filename || 'audio.webm');
    form.append('model', model || 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: form
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'transcribe proxy error: ' + e.message, stack: e.stack });
  }
}
