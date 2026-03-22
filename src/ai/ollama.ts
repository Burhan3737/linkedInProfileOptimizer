import type { AIProvider, CompletionOptions } from './provider';
import { createProviderError } from './provider';

export class OllamaProvider implements AIProvider {
  readonly name = 'Ollama';

  constructor(
    private readonly baseUrl: string,
    private readonly model: string
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      // 403 means Ollama is running but rejecting the extension origin
      if (res.status === 403) throw new Error('CORS blocked');
      return res.ok;
    } catch {
      return false;
    }
  }

  async generateCompletion(options: CompletionOptions): Promise<string> {
    // Convert messages to a single prompt string for Ollama
    const prompt = options.messages
      .map((m) => {
        if (m.role === 'system') return `System: ${m.content}`;
        if (m.role === 'user') return `User: ${m.content}`;
        return `Assistant: ${m.content}`;
      })
      .join('\n\n');

    // 3-minute timeout — large models on CPU can be slow
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180_000);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            num_predict: options.maxTokens ?? 2048,
            temperature: options.temperature ?? 0.7,
          },
        }),
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw createProviderError(
          this.name,
          'Request timed out after 3 minutes. Your model may be too large for your hardware, ' +
          'or Ollama is busy. Try a smaller model (e.g. llama3.2:1b) or switch to OpenRouter.'
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 403) {
        throw createProviderError(
          this.name,
          'HTTP 403 — Ollama is blocking requests from the extension. ' +
          'Restart Ollama with: OLLAMA_ORIGINS=* ollama serve'
        );
      }
      throw createProviderError(this.name, `HTTP ${response.status}: ${text}`);
    }

    const data = (await response.json()) as { response: string };
    if (!data.response) {
      throw createProviderError(this.name, 'Empty response from Ollama');
    }
    return data.response;
  }
}
