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
        addLog(`⟳ ${step.label}${step.detail ? ` — ${step.detail}` : ''}`, 'info');
      } else if (step.status === 'done') {
        addLog(`✓ ${step.label}`, 'success');
      } else if (step.status === 'error') {
        addLog(`✕ ${step.label}${step.detail ? `: ${step.detail}` : ''}`, 'error');
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
      parsing:    '⟳ Sending resume text to AI for structured extraction...',
      scraping:   '⟳ Injecting content script into LinkedIn tab...',
      analyzing:  '⟳ Comparing resume against LinkedIn profile...',
      optimizing: '⟳ Starting section-by-section AI optimization...',
      reviewing:  '✓ All sections optimized — ready for your review',
      error:      `✕ Error: ${session.error ?? 'unknown'}`,
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">
            {isError ? 'Error' : isDone ? 'Ready for review' : 'Analyzing profile...'}
          </h2>
          {!isDone && !isError && (
            <span className="text-xs text-gray-400 tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          )}
        </div>

        {/* Top-level progress bar */}
        {!isError && (
          <div className="mt-2">
            <div className="flex gap-1">
              {topSteps.map((step) => (
                <div
                  key={step.id}
                  className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                    step.status === 'done' ? 'bg-green-400' :
                    step.status === 'running' ? 'bg-linkedin-blue animate-pulse' :
                    step.status === 'error' ? 'bg-red-400' :
                    'bg-gray-200'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Main steps */}
        <div className="flex flex-col gap-1.5">
          {topSteps.map((step) => (
            <StepRow key={step.id} label={step.label} status={step.status} />
          ))}
        </div>

        {/* Section sub-steps during optimization */}
        {sectionSteps.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-600">Sections</span>
              <span className="text-xs text-gray-400">
                {completedSections}/{totalSections}
              </span>
            </div>
            <div className="flex flex-col gap-1 pl-3 border-l-2 border-gray-100">
              {sectionSteps.map((step) => (
                <div key={step.id} className="flex items-center gap-2">
                  <MiniIcon status={step.status} />
                  <span className={`text-xs truncate ${
                    step.status === 'running' ? 'text-linkedin-blue font-medium' :
                    step.status === 'done' ? 'text-gray-500' :
                    step.status === 'error' ? 'text-red-500' :
                    'text-gray-400'
                  }`}>
                    {step.label.replace('Optimizing ', '')}
                  </span>
                  {step.status === 'running' && (
                    <span className="text-xs text-gray-400 italic truncate">{step.detail}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {isError && session?.error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-3">
            <p className="font-semibold mb-1">Error</p>
            <p className="whitespace-pre-wrap leading-relaxed">{session.error}</p>
            <button
              className="mt-2 text-xs text-red-500 underline"
              onClick={() => navigator.clipboard.writeText(session.error ?? '')}
            >
              Copy error text
            </button>
          </div>
        )}

        {/* Live log */}
        {log.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Activity</div>
            <div className="bg-gray-50 border border-gray-100 rounded p-2 max-h-44 overflow-y-auto font-mono">
              {log.map((entry) => (
                <div
                  key={entry.id}
                  className={`text-xs leading-5 ${
                    entry.type === 'success' ? 'text-green-700' :
                    entry.type === 'error' ? 'text-red-600' :
                    'text-gray-600'
                  }`}
                >
                  <span className="text-gray-300 mr-1.5 select-none">
                    {formatTs(entry.ts)}
                  </span>
                  {entry.text}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {isDone && (
          <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-3 text-center font-medium">
            ✓ Optimization complete — switching to review...
          </div>
        )}
      </div>

      {isError && (
        <div className="border-t border-gray-200 p-3">
          <button onClick={onReset} className="btn-secondary text-xs w-full">
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}

function StepRow({ label, status }: { label: string; status: LiveStep['status'] }) {
  return (
    <div className="flex items-center gap-2.5">
      <StepIcon status={status} />
      <span className={`text-xs font-medium ${
        status === 'running' ? 'text-gray-900' :
        status === 'done' ? 'text-gray-400' :
        status === 'error' ? 'text-red-600' :
        'text-gray-400'
      }`}>
        {label}
      </span>
      {status === 'running' && (
        <span className="text-xs text-gray-400 italic">working...</span>
      )}
    </div>
  );
}

function StepIcon({ status }: { status: LiveStep['status'] }) {
  const base = 'w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs';
  if (status === 'done')    return <div className={`${base} bg-green-100 text-green-600`}>✓</div>;
  if (status === 'running') return <div className={`${base} bg-linkedin-blue-light`}><Spinner /></div>;
  if (status === 'error')   return <div className={`${base} bg-red-100 text-red-500`}>✕</div>;
  return <div className={`${base} bg-gray-100 text-gray-300`}>·</div>;
}

function MiniIcon({ status }: { status: LiveStep['status'] }) {
  if (status === 'done')    return <span className="text-green-500 text-xs shrink-0">✓</span>;
  if (status === 'running') return <Spinner className="text-linkedin-blue shrink-0" />;
  if (status === 'error')   return <span className="text-red-400 text-xs shrink-0">✕</span>;
  return <span className="text-gray-300 text-xs shrink-0">·</span>;
}

function Spinner({ className = 'text-linkedin-blue' }: { className?: string }) {
  return (
    <svg
      className={`w-3 h-3 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function formatElapsed(s: number): string {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
