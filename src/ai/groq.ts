import type { AIProvider, CompletionOptions, CompletionMessage } from './provider';
import { createProviderError } from './provider';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';

export class GroqProvider implements AIProvider {
  readonly name = 'Groq';

  constructor(private apiKey: string, private model: string = DEFAULT_GROQ_MODEL) {}

  async isAvailable(): Promise<boolean> {
    return typeof this.apiKey === 'string' && this.apiKey.trim().length > 0;
  }

  async generateCompletion(options: CompletionOptions): Promise<string> {
    const hasSystem = options.messages.some((m) => m.role === 'system');
    const messages: CompletionMessage[] = hasSystem
      ? options.messages
      : [
          {
            role: 'system',
            content:
              'You are a structured data extraction API. Respond with a single valid JSON object only. No explanation or markdown.',
          },
          ...options.messages,
        ];

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.1,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (response.status === 401) {
      throw createProviderError(this.name, 'Invalid API key — open Settings and verify your Groq API key, or get a free one at console.groq.com');
    }
    if (response.status === 429) {
      const body = await response.text().catch(() => '');
      console.error('[Groq] 429 response body:', body);
      const isTokenLimit = /token|daily|quota/i.test(body);
      if (isTokenLimit) {
        throw createProviderError(this.name, 'Daily token limit reached on your Groq plan. Try again tomorrow, or switch to a faster/smaller model in Settings.');
      }
      throw createProviderError(this.name, 'Groq rate limit hit — too many requests per minute. Wait 30 seconds and try again, or switch to a different model in Settings.');
    }
    if (!response.ok) {
      const text = await response.text();
      console.error(`[Groq] HTTP ${response.status} error:`, text);
      throw createProviderError(this.name, `Groq API request failed (HTTP ${response.status}). Check your internet connection and try again.`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string | null } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw createProviderError(this.name, 'Empty response from API');
    return content;
  }
}
