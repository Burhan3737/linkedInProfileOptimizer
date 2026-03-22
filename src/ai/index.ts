import type { UserSettings } from '../shared/types';
import type { AIProvider } from './provider';
import { GroqProvider } from './groq';

export { GroqProvider } from './groq';
export type { AIProvider, CompletionOptions, CompletionMessage } from './provider';

export function createProvider(settings: UserSettings): AIProvider {
  return new GroqProvider(settings.groqApiKey, settings.groqModel);
}

export async function getAvailableProvider(settings: UserSettings): Promise<AIProvider> {
  const provider = createProvider(settings);
  if (await provider.isAvailable()) return provider;
  throw new Error('Groq is unavailable. Check your API key in Settings (get a free key at console.groq.com).');
}
