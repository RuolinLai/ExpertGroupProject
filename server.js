/* MUSE server: serves the website and answers the "Ask MUSE AI" chat box.
   The browser sends the user's message, the recent conversation and their
   stats; this server adds the instructions and asks Groq for a reply.
   The Groq API key lives only here (in .env), never in the browser. */
const path = require('path');
const express = require('express');
const cors = require('cors'); // Required to allow frontend at port 5500 to talk to backend at port 3000

try { process.loadEnvFile(path.join(__dirname, '.env')); }
catch (error) { /* No .env file: fall back to real environment variables. */ }

const PORT = Number(process.env.PORT) || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MAX_MESSAGE_CHARACTERS = 1000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_STATS_CHARACTERS = 8000;

const app = express();

// Middleware setup
app.use(cors()); // Enable CORS for all routes (connects Live Server to your backend)
app.use(express.json()); // Essential for reading JSON body data from frontend requests
app.use(express.json({ limit: '50kb' }));

const SYSTEM_PROMPT = `You are MUSE AI, the friendly assistant inside MUSE, a website where people
practise dance with their camera, get live pose and sync scores, and keep their
dance videos in a gallery.

How to answer:
- Be warm, encouraging and clear, like a supportive dance coach. Keep replies short
  (usually 2-5 sentences) unless the user asks for more detail.
- The user may ask a question or just make a statement ("I'm tired today", "I nailed
  it!"). Respond naturally to either.
- Use the user's real data below whenever it is relevant: mention actual numbers,
  compare recent sessions with earlier ones, and point out trends.
- Sync scores are percentages: overall, timing (on the beat), align (pose matches the
  reference) and energy (movement size). 85%+ is excellent, 70%+ good, 50%+ getting there.
- Never invent statistics. If something isn't in the data, say you don't have it yet
  and suggest how they could get it (e.g. save a sync session on the Features page).
- Reply in the same language the user writes in.
- If asked about something unrelated to dance, practice or MUSE, answer briefly and
  kindly steer back.`;

  
// Only the website folders are public; server.js, .env and package files are not.
const root = __dirname;
app.use('/general%20files', express.static(path.join(root, 'general files')));
app.use('/assets', express.static(path.join(root, 'assets')));
app.get('/', (req, res) => res.redirect('/general%20files/HTML/index.html'));

function cleanHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
        .filter(item => item && (item.role === 'user' || item.role === 'assistant')
            && typeof item.content === 'string' && item.content.trim())
        .slice(-MAX_HISTORY_MESSAGES)
        .map(item => ({ role: item.role, content: item.content.slice(0, MAX_MESSAGE_CHARACTERS) }));
}

function describeStats(stats) {
    if (!stats || typeof stats !== 'object') return 'No stats were provided.';
    const text = JSON.stringify(stats, null, 1);
    return text.length > MAX_STATS_CHARACTERS ? text.slice(0, MAX_STATS_CHARACTERS) + '\n...(trimmed)' : text;
}

app.post('/api/chat', async (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) return res.status(400).json({ reply: 'Please type a message first.' });
    if (message.length > MAX_MESSAGE_CHARACTERS) {
        return res.status(400).json({ reply: `Please keep messages under ${MAX_MESSAGE_CHARACTERS} characters.` });
    }
    if (!GROQ_API_KEY) {
        console.error('GROQ_API_KEY is missing. Add it to the .env file.');
        return res.status(500).json({ reply: 'The AI is not set up yet (missing API key).' });
    }

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: `Today is ${new Date().toDateString()}.\nThe user's MUSE data:\n${describeStats(req.body.stats)}` },
        ...cleanHistory(req.body.history),
        { role: 'user', content: message }
    ];

    try {
        const response = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
            body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.7, max_tokens: 500 }),
            signal: AbortSignal.timeout(30000)
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
            console.error('Groq error', response.status, data?.error?.message || data);
            const busy = response.status === 429;
            return res.status(502).json({
                reply: busy ? 'I\'m getting a lot of questions right now. Try again in a moment.'
                    : 'Sorry, I couldn\'t reach the AI just now. Please try again.'
            });
        }
        const reply = data?.choices?.[0]?.message?.content?.trim();
        res.json({ reply: reply || 'Sorry, I didn\'t catch that. Could you say it another way?' });
    } catch (error) {
        console.error('Could not reach Groq:', error.message);
        res.status(502).json({ reply: 'Sorry, I couldn\'t reach the AI just now. Please try again.' });
    }
});

app.listen(PORT, () => {
    console.log(`MUSE is running at http://localhost:${PORT}`);
    if (!GROQ_API_KEY) console.warn('Warning: GROQ_API_KEY is empty. Put your key in the .env file.');
});
