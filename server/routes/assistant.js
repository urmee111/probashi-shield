const express = require('express');
const { pool } = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { answer, languages } = require('../services/ragAssistant');

const router = express.Router();

router.post('/chat', authenticate, async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { message, language = 'auto' } = body;
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text || Array.from(text).length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    return res.status(400).json({ error: 'message must contain 1 to 1000 printable characters.' });
  }
  if (!languages.has(language)) {
    return res.status(400).json({ error: 'language must be auto, en, bn, or banglish.' });
  }

  try {
    return res.json(await answer({ db: pool, userId: req.user.id, message: text, language }));
  } catch (error) {
    // The assistant degrades instead of failing: answer with the helpline only.
    console.error('Assistant failed', error.code || error.name);
    return res.json({
      reply: 'The assistant could not load its data right now. For help or to report fraud, call the expatriate helpline 16135.',
      citations: [{ type: 'static', id: 'helpline', label: 'Expatriate helpline 16135', source: 'Government expatriate welfare helpline' }],
      mode: 'deterministic_rag',
      retrievedCount: 0,
      degraded: true,
    });
  }
});

module.exports = router;
