import { useState, useRef, useCallback, useEffect } from 'react';
import type { OptimizationMode } from '../../shared/types';
import { sendToServiceWorker } from '../../shared/messaging';
import type { StartOptimizationPayload } from '../../shared/messaging';
import { extractTextFromFile } from '../../parsers/resume-parser';
import { saveResumeDraft, getResumeDraft, clearResumeDraft } from '../../shared/storage';

interface Props {
  onStart: () => void;
  existingSession?: import('../../shared/types').OptimizationSession | null;
  onResume?: () => void;
}

export default function WelcomeScreen({ onStart, existingSession, onResume }: Props) {
  const [file, setFile] = useState<File | null>(null);
  // Saved resume text + metadata when loaded from storage (no File object available)
  const [savedResume, setSavedResume] = useState<{ text: string; fileName: string; fileSize: number; savedAt: number } | null>(null);
  const [mode, setMode] = useState<OptimizationMode>('job_seeker');
  const [targetRole, setTargetRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load saved draft on mount ────────────────────────────────────────────────
  useEffect(() => {
    getResumeDraft().then((draft) => {
      if (!draft) return;
      setSavedResume({ text: draft.resumeText, fileName: draft.fileName, fileSize: draft.fileSize, savedAt: draft.savedAt });
      setTargetRole(draft.targetRole);
      setMode(draft.mode);
      setJobDescription(draft.jobDescription);
    }).catch(() => {});
  }, []);

  // ── File handling ────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'doc', 'docx', 'txt'].includes(ext ?? '')) {
      setError('Please upload a PDF, DOCX, or TXT file.');
      return;
    }
    setFile(f);
    setSavedResume(null); // clear saved state when new file chosen
    setError('');

    // Pre-extract text immediately so the user doesn't wait on submit
    setIsParsing(true);
    try {
      const text = await extractTextFromFile(f);
      if (!text.trim()) {
        setError('Could not extract text. Please ensure the file is not a scanned image-only PDF.');
        setFile(null);
      } else {
        // Stash extracted text on the file object for submit
        (f as File & { _extractedText?: string })._extractedText = text;
      }
    } catch (err) {
      setError(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
      setFile(null);
    } finally {
      setIsParsing(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleClearResume = async () => {
    setFile(null);
    setSavedResume(null);
    await clearResumeDraft();
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetRole.trim()) { setError('Please enter your target role.'); return; }

    const hasNew = file !== null;
    const hasSaved = savedResume !== null;
    if (!hasNew && !hasSaved) { setError('Please upload your resume.'); return; }

    // Ensure user is on a LinkedIn profile page before proceeding
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url ?? '';
      if (!url.match(/linkedin\.com\/in\//)) {
        setError('Please navigate to your LinkedIn profile page (linkedin.com/in/…) before analyzing.');
        return;
      }
    } catch {
      setError('Could not verify the current tab. Please ensure you are on your LinkedIn profile page.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      let resumeText: string;

      if (hasNew) {
        // Use pre-extracted text if available, otherwise extract now
        const f = file as File & { _extractedText?: string };
        resumeText = f._extractedText ?? await extractTextFromFile(file!);
        if (!resumeText.trim()) {
          setError('Could not extract text from resume.');
          setIsLoading(false);
          return;
        }
      } else {
        resumeText = savedResume!.text;
      }

      // Save draft so next session is pre-filled
      await saveResumeDraft({
        resumeText,
        fileName: file?.name ?? savedResume!.fileName,
        fileSize: file?.size ?? savedResume!.fileSize,
        savedAt: Date.now(),
        targetRole: targetRole.trim(),
        mode,
        jobDescription: jobDescription.trim(),
      });

      const payload: StartOptimizationPayload = {
        resumeText,
        mode,
        targetRole: targetRole.trim(),
        jobDescription: jobDescription.trim() || undefined,
      };

      const res = await sendToServiceWorker({ action: 'START_OPTIMIZATION', payload });
      if (!res.success) {
        setError(res.error ?? 'Failed to start optimization');
        setIsLoading(false);
        return;
      }

      onStart();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsLoading(false);
    }
  };

  const activeFileName = file?.name ?? savedResume?.fileName ?? null;
  const activeFileSize = file?.size ?? savedResume?.fileSize ?? null;
  const isSaved = !file && savedResume !== null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 p-5 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-neutral-900 tracking-tight">
          Optimize Your Profile
        </h1>
        <p className="text-sm text-neutral-500 mt-1 leading-relaxed">
          Upload your resume and let AI enhance each LinkedIn section.
        </p>
      </div>

      {/* Resume previous session banner */}
      {existingSession && onResume && (existingSession.status === 'reviewing' || existingSession.status === 'complete') && (
        <div className="card !p-3.5 border-brand-100 bg-brand-50 animate-slide-up">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-brand-700">
                {existingSession.status === 'reviewing' ? 'Review in progress' : 'Previous session complete'}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {existingSession.targetRole} · {existingSession.results.length} sections
                {existingSession.status === 'reviewing' && ` · ${existingSession.results.filter(r => r.status === 'pending').length} pending`}
              </p>
            </div>
            <button type="button" onClick={onResume} className="btn-primary btn-sm shrink-0">
              Resume
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* File Upload */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="input-label !mb-0">Resume</label>
          {isSaved && (
            <span className="text-xs text-neutral-400">
              Saved {formatRelativeTime(savedResume!.savedAt)}
            </span>
          )}
        </div>

        {activeFileName ? (
          <div className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors ${
            isSaved
              ? 'border-success-500/20 bg-success-50'
              : 'border-brand-200 bg-brand-50'
          }`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                isParsing ? 'bg-neutral-100' : isSaved ? 'bg-success-100' : 'bg-brand-100'
              }`}>
                {isParsing ? (
                  <div className="w-3.5 h-3.5 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isSaved ? '#16A34A' : '#1E3A5F'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                )}
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-medium truncate ${isSaved ? 'text-success-700' : 'text-brand-700'}`}>
                  {activeFileName}
                </p>
                <p className="text-xs text-neutral-400">
                  {isParsing ? 'Extracting text...' : activeFileSize ? `${(activeFileSize / 1024).toFixed(0)} KB` : ''}
                  {isSaved && !isParsing && ' · saved'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-ghost btn-sm !text-xs !px-2"
              >
                Change
              </button>
              <button
                type="button"
                onClick={handleClearResume}
                className="btn-ghost btn-sm !px-1.5 !text-neutral-400 hover:!text-danger-600"
                title="Remove"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-150
              ${isDragging
                ? 'border-brand-700 bg-brand-50'
                : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
              }`}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#737370" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-700">Drop your resume here</p>
                <p className="text-xs text-neutral-400 mt-0.5">PDF, DOCX, or TXT</p>
              </div>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>

      {/* Mode */}
      <div>
        <label className="input-label">Optimization Mode</label>
        <div className="grid grid-cols-2 gap-2.5">
          {([
            { value: 'job_seeker', label: 'Job Seeker', desc: 'Aggressive keyword optimization', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
            { value: 'visibility', label: 'Visibility', desc: 'Broad recruiter discovery', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' },
          ] as const).map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={`p-3.5 rounded-xl border text-left transition-all duration-150 ${
                mode === m.value
                  ? 'border-brand-700 bg-brand-50 ring-1 ring-brand-700/10'
                  : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={mode === m.value ? '#1E3A5F' : '#A3A3A0'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={m.icon}/>
                </svg>
                <span className={`font-semibold text-sm ${mode === m.value ? 'text-brand-700' : 'text-neutral-700'}`}>
                  {m.label}
                </span>
              </div>
              <div className="text-xs text-neutral-500 leading-relaxed">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Target Role */}
      <div>
        <label className="input-label">Target Role</label>
        <input
          type="text"
          className="input-field"
          placeholder="e.g. Senior Product Manager"
          value={targetRole}
          onChange={(e) => setTargetRole(e.target.value)}
        />
      </div>

      {/* Job Description */}
      <div>
        <label className="input-label">
          Job Description <span className="text-neutral-400 font-normal">(optional)</span>
        </label>
        <textarea
          className="input-field resize-none"
          rows={4}
          placeholder="Paste the job description for more targeted optimization..."
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
        />
      </div>

      {error && (
        <div className="alert-error text-xs animate-slide-up">
          {error}
        </div>
      )}

      <div className="alert-warning text-xs">
        <div className="flex items-start gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>Navigate to your <strong>LinkedIn profile page</strong> (linkedin.com/in/...) before clicking Analyze.</span>
        </div>
      </div>

      <button type="submit" className="btn-primary w-full" disabled={isLoading || isParsing}>
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Starting...
          </>
        ) : isParsing ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Reading file...
          </>
        ) : (
          'Analyze My Profile'
        )}
      </button>
    </form>
  );
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
