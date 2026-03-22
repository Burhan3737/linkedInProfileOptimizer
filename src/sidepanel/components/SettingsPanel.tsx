import { useState, useEffect } from 'react';
import type { UserSettings } from '../../shared/types';
import { sendToServiceWorker } from '../../shared/messaging';
import { GROQ_MODELS } from '../../shared/constants';

interface Props {
  onBack: () => void;
}

export default function SettingsPanel({ onBack }: Props) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    sendToServiceWorker<unknown, UserSettings>({ action: 'GET_SETTINGS' })
      .then((res) => {
        if (res.success && res.data) setSettings(res.data);
      })
      .catch(() => {});
  }, []);

  const update = (key: keyof UserSettings, value: string | boolean) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    await sendToServiceWorker({ action: 'SAVE_SETTINGS', payload: settings });
    setIsSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) {
    return <div className="p-4 text-xs text-gray-500">Loading settings...</div>;
  }

  const selectedModel = GROQ_MODELS.find((m) => m.id === settings.groqModel);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-700 text-xs">
          ← Back
        </button>
        <h2 className="font-semibold text-gray-900">Settings</h2>
      </div>

      <div className="card flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-gray-700">Groq API</h3>

        <div>
          <label className="block text-xs text-gray-600 mb-1">API Key</label>
          <input
            type="password"
            className="input-field text-xs"
            placeholder="gsk_..."
            value={settings.groqApiKey}
            onChange={(e) => update('groqApiKey', e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">
            Free key at <span className="text-linkedin-blue">console.groq.com</span> — no credit card needed for free-tier models
          </p>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Model</label>
          <select
            className="input-field text-xs"
            value={settings.groqModel}
            onChange={(e) => update('groqModel', e.target.value)}
          >
            <optgroup label="── Free tier">
              {GROQ_MODELS.filter((m) => m.tier === 'free').map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="── Paid (billed per token)">
              {GROQ_MODELS.filter((m) => m.tier === 'paid').map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
          </select>
          {selectedModel?.tier === 'paid' && (
            <p className="text-xs text-amber-600 mt-1">
              This model is billed per token. Make sure you have Groq credits at console.groq.com.
            </p>
          )}
        </div>
      </div>

      <button onClick={handleSave} className="btn-primary" disabled={isSaving}>
        {isSaving ? 'Saving...' : saved ? '✓ Saved' : 'Save Settings'}
      </button>
    </div>
  );
}
