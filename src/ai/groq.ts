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
      throw createProviderError(this.name, 'Invalid API key. Get a free key at console.groq.com');
    }
    if (response.status === 429) {
      throw createProviderError(this.name, 'Rate limited. Wait a moment and try again.');
    }
    if (!response.ok) {
      const text = await response.text();
      throw createProviderError(this.name, `HTTP ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string | null } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw createProviderError(this.name, 'Empty response from API');
    return content;
  }
}
