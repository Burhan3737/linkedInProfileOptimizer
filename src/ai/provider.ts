export interface CompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  messages: CompletionMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface AIProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  generateCompletion(options: CompletionOptions): Promise<string>;
}

export function createProviderError(provider: string, message: string): Error {
  return new Error(`[${provider}] ${message}`);
}
