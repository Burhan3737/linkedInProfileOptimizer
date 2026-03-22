import { useState, useEffect, useCallback } from 'react';
import type { OptimizationSession } from '../shared/types';
import type { ChromeMessage } from '../shared/messaging';
import { sendToServiceWorker } from '../shared/messaging';
import WelcomeScreen from './components/WelcomeScreen';
import AnalysisScreen from './components/AnalysisScreen';
import SectionReview from './components/SectionReview';
import SummaryScreen from './components/SummaryScreen';
import SettingsPanel from './components/SettingsPanel';

type Screen = 'loading' | 'welcome' | 'analysis' | 'review' | 'summary' | 'settings';

function screenForSession(s: OptimizationSession): Screen {
  switch (s.status) {
    case 'reviewing':                                          return 'review';
    case 'complete':                                           return 'summary';
    case 'error':                                             return 'analysis';
    case 'parsing': case 'scraping':
    case 'analyzing': case 'optimizing': case 'applying':    return 'analysis';
    default:                                                   return 'welcome';
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [session, setSession] = useState<OptimizationSession | null>(null);

  // Restore session on mount — stay on 'loading' until storage is read
  useEffect(() => {
    sendToServiceWorker({ action: 'GET_SESSION' })
      .then((res) => {
        if (res.success && res.data) {
          const s = res.data as OptimizationSession;
          setSession(s);
          setScreen(screenForSession(s));
        } else {
          setScreen('welcome');
        }
      })
      .catch(() => setScreen('welcome'));
  }, []);

  // Live updates from service worker while pipeline runs
  useEffect(() => {
    const listener = (message: ChromeMessage) => {
      if (message.action === 'SESSION_UPDATE' && message.payload) {
        const updated = message.payload as OptimizationSession;
        setSession(updated);
        setScreen(screenForSession(updated));
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleStartOptimization = useCallback(() => setScreen('analysis'), []);

  const handleReset = useCallback(async () => {
    await sendToServiceWorker({ action: 'RESET_SESSION' });
    setSession(null);
    setScreen('welcome');
  }, []);

  const backFromSettings = (): Screen => {
    if (!session) return 'welcome';
    return screenForSession(session);
  };

  return (
    <div className="flex flex-col h-full bg-surface-warm">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-neutral-200 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-brand-700 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 3H4C3.45 3 3 3.45 3 4V20C3 20.55 3.45 21 4 21H20C20.55 21 21 20.55 21 20V4C21 3.45 20.55 3 20 3ZM8.34 18.34H5.66V9.75H8.34V18.34ZM7 8.56C6.07 8.56 5.32 7.81 5.32 6.88C5.32 5.95 6.07 5.2 7 5.2C7.93 5.2 8.68 5.95 8.68 6.88C8.68 7.81 7.93 8.56 7 8.56ZM18.34 18.34H15.66V13.84C15.66 12.63 15.2 11.84 14.18 11.84C13.41 11.84 12.96 12.37 12.77 12.89C12.7 13.06 12.68 13.3 12.68 13.54V18.34H10V9.75H12.68V10.98C13.04 10.37 13.71 9.54 15.18 9.54C17 9.54 18.34 10.72 18.34 13.5V18.34Z" fill="white"/>
            </svg>
          </div>
          <span className="font-semibold text-neutral-900 text-sm tracking-tight">
            Profile Optimizer
          </span>
        </div>
        {screen !== 'loading' && (
          <button
            onClick={() => setScreen(screen === 'settings' ? backFromSettings() : 'settings')}
            className="btn-ghost btn-sm !px-2.5 !py-1.5"
          >
            {screen === 'settings' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            )}
          </button>
        )}
      </header>

      {/* ── Main ───────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {screen === 'loading' ? (
          <LoadingState />
        ) : screen === 'settings' ? (
          <SettingsPanel onBack={() => setScreen(backFromSettings())} />
        ) : screen === 'welcome' ? (
          <WelcomeScreen onStart={handleStartOptimization} existingSession={session} onResume={() => setScreen(screenForSession(session!))} />
        ) : screen === 'analysis' ? (
          <AnalysisScreen session={session} onReset={handleReset} />
        ) : screen === 'review' ? (
          <SectionReview session={session!} onComplete={async () => { await sendToServiceWorker({ action: 'COMPLETE_REVIEW' }); setScreen('summary'); }} onReset={handleReset} />
        ) : screen === 'summary' ? (
          <SummaryScreen session={session} onReset={handleReset} />
        ) : null}
      </main>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 animate-fade-in">
      <div className="w-8 h-8 border-2 border-neutral-200 border-t-brand-700 rounded-full animate-spin" />
      <span className="text-xs text-neutral-400 font-medium">Loading...</span>
    </div>
  );
}
