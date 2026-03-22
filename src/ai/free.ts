import type { AIProvider, CompletionOptions, CompletionMessage } from './provider';
import { createProviderError } from './provider';

// GET endpoint — ?json=true forces the model to emit a raw JSON body
// instead of a reasoning trace. The POST /openai endpoint uses a reasoning
// model (gpt-oss-20b) that exhausts its token budget on reasoning_content
// and never populates the content field reliably.
const POLLINATIONS_GET = 'https://text.pollinations.ai';
const FREE_MODEL = 'openai';

// Max chars we'll put in the URL. At ~3 bytes per encoded char this keeps
// the full URL well under 64 KB (Pollinations' observed limit).
const MAX_PROMPT_URL_CHARS = 12_000;

export class FreeProvider implements AIProvider {
  readonly name = 'Free (Pollinations.ai)';

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(
        `${POLLINATIONS_GET}/${encodeURIComponent('hi')}?model=${FREE_MODEL}`,
        { signal: AbortSignal.timeout(8000) },
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  async generateCompletion(options: CompletionOptions): Promise<string> {
    // Build a single prompt string from the messages array.
    const systemMsg = options.messages.find((m) => m.role === 'system');
    const userMsgs = options.messages.filter((m) => m.role === 'user');
    const prompt = userMsgs.map((m) => m.content).join('\n\n');
    const system = systemMsg?.content ??
      'You are a structured data extraction API. Output ONLY a valid JSON object, no explanation.';

    // Truncate if the combined prompt would make the URL too long.
    const safePrompt = prompt.length > MAX_PROMPT_URL_CHARS
      ? prompt.slice(0, MAX_PROMPT_URL_CHARS)
      : prompt;

    const url =
      `${POLLINATIONS_GET}/${encodeURIComponent(safePrompt)}` +
      `?json=true&model=${FREE_MODEL}&system=${encodeURIComponent(system)}` +
      `&seed=${Math.floor(Math.random() * 999999)}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(120_000),
    });

    if (response.status === 429) {
      throw createProviderError(
        this.name,
        'Rate limited. Wait a moment and try again, or configure an OpenRouter API key in Settings for higher limits.',
      );
    }
    if (!response.ok) {
      const text = await response.text();
      throw createProviderError(this.name, `HTTP ${response.status}: ${text}`);
    }

    const text = await response.text();
    if (!text || text.trim().length === 0) {
      throw createProviderError(this.name, 'Empty response from API');
    }

    return text;
  }
}
