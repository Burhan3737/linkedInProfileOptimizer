import { useEffect, useState, useRef } from 'react';
import type { OptimizationSession } from '../../shared/types';
import type { ChromeMessage } from '../../shared/messaging';

interface Props {
  session: OptimizationSession | null;
  onReset: () => void;
}

interface LiveStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
  ts: number;
}

interface LogEntry {
  id: number;
  text: string;
  type: 'info' | 'success' | 'error';
  ts: number;
}

// Maps session.status → which of the 4 top-level steps is active
const TOP_STEPS: { id: string; label: string; statusMatch: OptimizationSession['status'][] }[] = [
  { id: 'parse',    label: 'Parse resume',            statusMatch: ['parsing'] },
  { id: 'scrape',   label: 'Scrape LinkedIn profile',  statusMatch: ['scraping'] },
  { id: 'analyze',  label: 'Gap analysis',             statusMatch: ['analyzing'] },
  { id: 'optimize', label: 'AI optimization',          statusMatch: ['optimizing'] },
];

const STATUS_ORDER: OptimizationSession['status'][] = [
  'parsing', 'scraping', 'analyzing', 'optimizing', 'reviewing', 'complete',
];

function statusIndex(s: OptimizationSession['status']): number {
  return STATUS_ORDER.indexOf(s);
}

export default function AnalysisScreen({ session, onReset }: Props) {
  const [subSteps, setSubSteps] = useState<LiveStep[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(Date.now());
  const logCounter = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  const status = session?.status ?? 'idle';
  const isError = status === 'error';
  const isDone = status === 'reviewing' || status === 'complete';

  // Elapsed timer
  useEffect(() => {
    if (isDone || isError) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [isDone, isError]);

  function addLog(text: string, type: LogEntry['type'] = 'info') {
    setLog((prev) => [...prev.slice(-49), { id: logCounter.current++, text, type, ts: Date.now() }]);
  }

  // Listen for pipeline step updates
  useEffect(() => {
    const listener = (message: ChromeMessage) => {
      if (message.action !== 'PIPELINE_STEP_UPDATE' || !message.payload) return;
      const step = message.payload as LiveStep;

      setSubSteps((prev) => {
        const idx = prev.findIndex((s) => s.id === step.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...step, ts: Date.now() };
          return updated;
        }
        return [...prev, { ...step, ts: Date.now() }];
      });

      // Feed into log
      if (step.status === 'running') {
        addLog(`${step.label}${step.detail ? ` — ${step.detail}` : ''}`, 'info');
      } else if (step.status === 'done') {
        addLog(`${step.label}`, 'success');
      } else if (step.status === 'error') {
        addLog(`${step.label}${step.detail ? `: ${step.detail}` : ''}`, 'error');
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Log session status transitions
  const prevStatusRef = useRef<string>('');
  useEffect(() => {
    if (!session || session.status === prevStatusRef.current) return;
    prevStatusRef.current = session.status;

    const msgs: Record<string, string> = {
      parsing:    'Sending resume text to AI for structured extraction...',
      scraping:   'Injecting content script into LinkedIn tab...',
      analyzing:  'Comparing resume against LinkedIn profile...',
      optimizing: 'Starting section-by-section AI optimization...',
      reviewing:  'All sections optimized — ready for your review',
      error:      `Error: ${session.error ?? 'unknown'}`,
    };

    if (msgs[session.status]) {
      addLog(msgs[session.status], session.status === 'error' ? 'error' : session.status === 'reviewing' ? 'success' : 'info');
    }
  }, [session?.status]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  // Compute top-level step states
  const topSteps = TOP_STEPS.map((s) => {
    const currentIdx = statusIndex(status);
    const stepIdx = statusIndex(s.statusMatch[0]);

    let stepStatus: LiveStep['status'] = 'pending';
    if (isError && s.statusMatch.includes(status)) stepStatus = 'error';
    else if (currentIdx > stepIdx) stepStatus = 'done';
    else if (s.statusMatch.includes(status)) stepStatus = 'running';

    // Override from sub-step data (for 'optimize' — show error if any sub-step errored)
    if (s.id === 'optimize') {
      const optimizeSubSteps = subSteps.filter((ss) => ss.id.startsWith('optimize-'));
      if (optimizeSubSteps.some((ss) => ss.status === 'running')) stepStatus = 'running';
      if (optimizeSubSteps.length > 0 && optimizeSubSteps.every((ss) => ss.status === 'done' || ss.status === 'error')) {
        stepStatus = 'done';
      }
    }

    return { ...s, status: stepStatus };
  });

  // Section sub-steps (only for optimize phase)
  const sectionSteps = subSteps.filter((s) => s.id.startsWith('optimize-'));

  const completedSections = sectionSteps.filter((s) => s.status === 'done' || s.status === 'error').length;
  const totalSections = sectionSteps.length;

  return (
    <div className="flex flex-col h-full overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-neutral-100">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-neutral-900 tracking-tight">
            {isError ? 'Something went wrong' : isDone ? 'Ready for review' : 'Analyzing profile'}
          </h2>
          {!isDone && !isError && (
            <span className="text-xs text-neutral-400 tabular-nums font-medium bg-neutral-100 px-2.5 py-1 rounded-full">
              {formatElapsed(elapsed)}
            </span>
          )}
        </div>

        {/* Top-level progress bar */}
        {!isError && (
          <div className="mt-3 flex gap-1.5">
            {topSteps.map((step) => (
              <div
                key={step.id}
                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                  step.status === 'done' ? 'bg-success-500' :
                  step.status === 'running' ? 'bg-brand-700 animate-pulse-subtle' :
                  step.status === 'error' ? 'bg-danger-500' :
                  'bg-neutral-200'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
        {/* Main steps */}
        <div className="flex flex-col gap-1">
          {topSteps.map((step) => (
            <StepRow key={step.id} label={step.label} status={step.status} />
          ))}
        </div>

        {/* Section sub-steps during optimization */}
        {sectionSteps.length > 0 && (
          <div className="animate-slide-up">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-neutral-600">Sections</span>
              <span className="text-xs text-neutral-400 font-medium">
                {completedSections}/{totalSections}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 pl-3 border-l-2 border-neutral-200">
              {sectionSteps.map((step) => (
                <div key={step.id} className="flex items-center gap-2.5 py-1">
                  <MiniIcon status={step.status} />
                  <span className={`text-xs truncate ${
                    step.status === 'running' ? 'text-brand-700 font-medium' :
                    step.status === 'done' ? 'text-neutral-400' :
                    step.status === 'error' ? 'text-danger-600' :
                    'text-neutral-400'
                  }`}>
                    {step.label.replace('Optimizing ', '')}
                  </span>
                  {step.status === 'running' && step.detail && (
                    <span className="text-xs text-neutral-400 truncate">{step.detail}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {isError && session?.error && (
          <div className="alert-error text-xs animate-slide-up">
            <p className="font-semibold mb-1.5">Error</p>
            <p className="whitespace-pre-wrap leading-relaxed">{session.error}</p>
            <button
              className="mt-2 text-xs text-danger-600 hover:text-danger-700 underline underline-offset-2 transition-colors"
              onClick={() => navigator.clipboard.writeText(session.error ?? '')}
            >
              Copy error text
            </button>
          </div>
        )}

        {/* Live log */}
        {log.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-neutral-500 mb-2">Activity</div>
            <div className="card-muted !p-3 max-h-44 overflow-y-auto font-mono">
              {log.map((entry) => (
                <div
                  key={entry.id}
                  className={`text-xs leading-6 flex gap-2 ${
                    entry.type === 'success' ? 'text-success-700' :
                    entry.type === 'error' ? 'text-danger-600' :
                    'text-neutral-500'
                  }`}
                >
                  <span className="text-neutral-300 select-none shrink-0 tabular-nums">
                    {formatTs(entry.ts)}
                  </span>
                  <span className="shrink-0">
                    {entry.type === 'success' ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : entry.type === 'error' ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5"><polyline points="9 18 15 12 9 6"/></svg>
                    )}
                  </span>
                  <span>{entry.text}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {isDone && (
          <div className="alert-success text-sm text-center font-medium animate-slide-up">
            <div className="flex items-center justify-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Optimization complete — switching to review
            </div>
          </div>
        )}
      </div>

      {isError && (
        <div className="border-t border-neutral-200 p-4 bg-white">
          <button onClick={onReset} className="btn-secondary w-full">
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}

function StepRow({ label, status }: { label: string; status: LiveStep['status'] }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <StepIcon status={status} />
      <span className={`text-sm font-medium ${
        status === 'running' ? 'text-neutral-900' :
        status === 'done' ? 'text-neutral-400' :
        status === 'error' ? 'text-danger-600' :
        'text-neutral-300'
      }`}>
        {label}
      </span>
      {status === 'running' && (
        <span className="text-xs text-neutral-400">working...</span>
      )}
    </div>
  );
}

function StepIcon({ status }: { status: LiveStep['status'] }) {
  const base = 'w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-200';
  if (status === 'done') return (
    <div className={`${base} bg-success-50 text-success-600`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
  );
  if (status === 'running') return (
    <div className={`${base} bg-brand-50`}>
      <div className="w-3 h-3 border-2 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
    </div>
  );
  if (status === 'error') return (
    <div className={`${base} bg-danger-50 text-danger-500`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </div>
  );
  return <div className={`${base} bg-neutral-100`}><div className="w-1.5 h-1.5 rounded-full bg-neutral-300" /></div>;
}

function MiniIcon({ status }: { status: LiveStep['status'] }) {
  if (status === 'done') return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
  );
  if (status === 'running') return (
    <div className="w-3 h-3 border-2 border-brand-200 border-t-brand-700 rounded-full animate-spin shrink-0" />
  );
  if (status === 'error') return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  );
  return <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 shrink-0" />;
}

function formatElapsed(s: number): string {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
