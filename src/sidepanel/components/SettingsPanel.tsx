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
    return (
      <div className="p-5 flex flex-col gap-4 animate-fade-in">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-10 w-full" />
      </div>
    );
  }

  const selectedModel = GROQ_MODELS.find((m) => m.id === settings.groqModel);

  return (
    <div className="flex flex-col gap-6 p-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="btn-ghost !p-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="font-bold text-neutral-900 tracking-tight">Settings</h2>
      </div>

      {/* Groq API section */}
      <div className="card flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1E3A5F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          </div>
          <h3 className="text-sm font-semibold text-neutral-900">Groq API</h3>
        </div>

        <div>
          <label className="input-label">API Key</label>
          <input
            type="password"
            className="input-field"
            placeholder="gsk_..."
            value={settings.groqApiKey}
            onChange={(e) => update('groqApiKey', e.target.value)}
          />
          <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
            Free key at <span className="text-brand-700 font-medium">console.groq.com</span> — no credit card needed for free-tier models.
          </p>
        </div>

        <div>
          <label className="input-label">Model</label>
          <select
            className="input-field"
            value={settings.groqModel}
            onChange={(e) => update('groqModel', e.target.value)}
          >
            <optgroup label="Free tier">
              {GROQ_MODELS.filter((m) => m.tier === 'free').map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="Paid (billed per token)">
              {GROQ_MODELS.filter((m) => m.tier === 'paid').map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
          </select>
          {selectedModel?.tier === 'paid' && (
            <div className="alert-warning text-xs mt-2">
              <div className="flex items-start gap-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>This model is billed per token. Make sure you have Groq credits.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <button onClick={handleSave} className="btn-primary w-full" disabled={isSaving}>
        {isSaving ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Saving...
          </>
        ) : saved ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Saved
          </>
        ) : (
          'Save Settings'
        )}
      </button>
    </div>
  );
}
