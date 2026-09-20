import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const MODEL = (process.env.OPENAI_MODEL || 'gpt-5.6-luna').trim();
const API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const openai = API_KEY ? new OpenAI({ apiKey: API_KEY }) : null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(publicDir));

const SYSTEM_PROMPT = `You are Master KOM AI for the user's business.
Help with business planning, marketing, content, sales, research, SEO, websites, documents, analytics, tasks and automation.
Be practical and concise. When an action requires an external account or permission that is not connected, clearly say what is needed. Never claim that you sent, posted, changed, purchased, deleted, or connected something unless a real tool completed it.`;

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    version: '0.3.0-REAL-AI',
    mode: openai ? 'AI' : 'NO_KEY',
    model: openai ? MODEL : null,
    keyLoaded: Boolean(API_KEY)
  });
});

app.post('/api/agent/run', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ ok: false, error: 'Message is required.' });
  if (!openai) return res.status(503).json({ ok: false, mode: 'NO_KEY', error: 'OPENAI_API_KEY is not loaded from backend/.env' });

  try {
    const response = await openai.responses.create({
      model: MODEL,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message }
      ]
    });
    res.json({ ok: true, mode: 'AI', model: MODEL, reply: response.output_text || 'No text response returned.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, mode: 'AI_ERROR', error: error?.message || 'OpenAI request failed.' });
  }
});

app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KOM AI 1.0 CLOUD: http://localhost:${PORT}`);
  console.log(`API key loaded: ${Boolean(API_KEY)}`);
  console.log(`Model: ${MODEL}`);
});
