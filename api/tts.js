// Vercel Serverless Function: proxy Fish Audio TTS
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const fishKey = process.env.FISH_KEY;
  const fishRef = process.env.FISH_REF;
  if (!fishKey || !fishRef) return res.status(500).json({ error: 'Server missing FISH_KEY/FISH_REF' });

  try {
    const { text, format } = req.body || {};
    if (!text) return res.status(400).json({ error: 'Missing text' });

    const response = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${fishKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        reference_id: fishRef,
        format: format || 'mp3',
        latency: 'balanced'
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
    const buffer = Buffer.from(await response.arrayBuffer());
    return res.status(200).send(buffer);
  } catch (e) {
    return res.status(500).json({ error: 'tts proxy error: ' + e.message });
  }
}
