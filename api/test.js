export default function handler(req, res) {
  return res.status(200).json({
    ok: true,
    method: req.method,
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    hasFishKey: !!process.env.FISH_KEY,
    hasFishRef: !!process.env.FISH_REF,
    nodeVersion: process.version
  });
}
