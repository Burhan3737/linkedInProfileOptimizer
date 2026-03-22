import type { AIProvider, CompletionOptions } from './provider';
import { createProviderError } from './provider';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 5000; // 5s, then 10s, 20s, 40s

export class OpenRouterProvider implements AIProvider {
  readonly name = 'OpenRouter';

  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async generateCompletion(options: CompletionOptions): Promise<string> {
    if (!this.apiKey) {
      throw createProviderError(this.name, 'API key not set. Go to Settings and add your OpenRouter API key.');
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 5s, 10s, 20s
        await new Promise(r => setTimeout(r, delay));
      }

      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(120_000),
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/linkedin-optimizer',
          'X-Title': 'LinkedIn Profile Optimizer',
        },
        body: JSON.stringify({
          model: this.model,
          messages: options.messages,
          max_tokens: options.maxTokens ?? 2048,
          temperature: options.temperature ?? 0.7,
        }),
      });

      if (response.status === 429) {
        // Parse retry-after header if present
        const retryAfter = response.headers.get('retry-after');
        const waitSec = retryAfter ? parseInt(retryAfter, 10) : null;

        if (attempt < MAX_RETRIES - 1) {
          const delay = waitSec ? waitSec * 1000 : BASE_DELAY_MS * Math.pow(2, attempt);
          lastError = new Error(`Rate limited (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${Math.round(delay / 1000)}s...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        // All retries exhausted
        const body = await response.text().catch(() => '');
        const isFreeModel = this.model.includes(':free');
        throw createProviderError(
          this.name,
          isFreeModel
            ? `Free model "${this.model}" is rate-limited by the upstream provider.\n\n` +
              `Options:\n` +
              `• Switch to a different free model in Settings (try "Llama 3.1 8B :free")\n` +
              `• Wait a few minutes and retry\n` +
              `• Add payment to your OpenRouter account for higher limits\n\n` +
              `Raw error: ${body.slice(0, 200)}`
            : `Rate limited (HTTP 429). Wait a moment and try again.\n\n${body.slice(0, 200)}`
        );
      }

      if (!response.ok) {
        const text = await response.text();
        throw createProviderError(this.name, `HTTP ${response.status}: ${text}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw createProviderError(this.name, 'Empty response from API');
      }
      return content;
    }

    throw lastError ?? createProviderError(this.name, 'All retry attempts failed');
  }
}
