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
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-linkedin-blue rounded flex items-center justify-center">
            <span className="text-white text-xs font-bold">in</span>
          </div>
          <span className="font-semibold text-gray-900">Profile Optimizer</span>
        </div>
        {screen !== 'loading' && (
          <button
            onClick={() => setScreen(screen === 'settings' ? backFromSettings() : 'settings')}
            className="text-gray-500 hover:text-gray-700 text-xs"
          >
            ⚙ Settings
          </button>
        )}
      </header>

      <main className="flex-1 overflow-y-auto">
        {screen === 'loading' ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-xs gap-2">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            Loading...
          </div>
        ) : screen === 'settings' ? (
          <SettingsPanel onBack={() => setScreen(backFromSettings())} />
        ) : screen === 'welcome' ? (
          <WelcomeScreen onStart={handleStartOptimization} existingSession={session} onResume={() => setScreen(screenForSession(session!))} />
        ) : screen === 'analysis' ? (
          <AnalysisScreen session={session} onReset={handleReset} />
        ) : screen === 'review' ? (
          <SectionReview session={session!} onComplete={() => setScreen('summary')} onReset={handleReset} />
        ) : screen === 'summary' ? (
          <SummaryScreen session={session} onReset={handleReset} />
        ) : null}
      </main>
    </div>
  );
}
