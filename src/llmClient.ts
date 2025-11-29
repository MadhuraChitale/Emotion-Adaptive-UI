// llmClient.ts
// Gemini 1.5 Flash wrapper with simple caching + soft rate limiting.

const GEMINI_MODEL = 'gemini-2.0-flash';
// Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
// Docs: Google Gemini API reference 

// Basic rate limiting: your free tier can handle quite a bit, but we keep this
// so you don't accidentally spam the API in dev.
const MIN_INTERVAL_MS = 2000; // 1 request every 2s is usually safe
let lastCallTime = 0;

// naive in-memory cache: same prompt -> same answer
const promptCache = new Map<string, string>();

export async function askLLM(prompt: string): Promise<string> {
  // 1) Cache
  if (promptCache.has(prompt)) {
    return promptCache.get(prompt)!;
  }

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('No REACT_APP_GEMINI_API_KEY set – returning fallback text.');
    return 'AI helper is not configured (missing Gemini API key).';
  }

  // 2) Soft client-side rate limiting
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < MIN_INTERVAL_MS) {
    const wait = MIN_INTERVAL_MS - elapsed;
    console.log(
      `[askLLM] backing off for ${Math.ceil(wait / 1000)}s to avoid spamming Gemini`,
    );
    await new Promise((r) => setTimeout(r, wait));
  }
  lastCallTime = Date.now();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    if (!res.ok) {
      let body: any = null;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      console.error('Gemini error', res.status, body);

      if (res.status === 429) {
        return 'Gemini rate limit hit. Please wait a few seconds and try again.';
      }
      if (body?.error?.message) {
        return `AI error: ${body.error.message}`;
      }
      return 'Sorry, the AI explanation failed.';
    }

    const data = await res.json();

    // Gemini response structure: candidates[0].content.parts[].text
    const candidates = data.candidates || [];
    if (!candidates.length) {
      return 'AI sent an empty response.';
    }

    const parts = candidates[0].content?.parts || [];
    const fullText = parts
      .map((p: any) => (typeof p.text === 'string' ? p.text : ''))
      .join('\n')
      .trim();

    const finalText = fullText || 'AI sent an empty response.';
    promptCache.set(prompt, finalText);
    return finalText;
  } catch (err) {
    console.error('Gemini request failed', err);
    return 'Sorry, the AI explanation could not be loaded.';
  }
}
