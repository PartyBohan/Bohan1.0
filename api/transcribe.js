// Vercel Serverless Function: proxy OpenAI Whisper STT
// Uses base64 JSON approach to avoid multipart streaming issues
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
    const { audio, filename, model } = req.body;
    if (!audio) return res.status(400).json({ error: 'Missing audio data' });

    // Decode base64 audio to buffer
    const audioBuffer = Buffer.from(audio, 'base64');

    // Build multipart form data manually
    const boundary = '----FormBoundary' + Date.now().toString(36);
    const parts = [];

    // File part
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename || 'audio.webm'}"\r\n` +
      `Content-Type: audio/webm\r\n\r\n`
    );
    parts.push(audioBuffer);
    parts.push('\r\n');

    // Model part
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `${model || 'whisper-1'}\r\n`
    );

    parts.push(`--${boundary}--\r\n`);

    // Combine into single buffer
    const body = Buffer.concat(parts.map(p => typeof p === 'string' ? Buffer.from(p) : p));

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: body
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
