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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Optimize Your LinkedIn</h1>
        <p className="text-xs text-gray-500 mt-1">
          Upload your resume, navigate to your LinkedIn profile, and let AI enhance each section.
        </p>
      </div>

      {/* Resume previous session banner */}
      {existingSession && onResume && (existingSession.status === 'reviewing' || existingSession.status === 'complete') && (
        <div className="bg-linkedin-blue-light border border-linkedin-blue/30 rounded-lg p-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-linkedin-blue">
              {existingSession.status === 'reviewing' ? '↩ Review in progress' : '✓ Previous session complete'}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              {existingSession.targetRole} · {existingSession.results.length} sections
              {existingSession.status === 'reviewing' && ` · ${existingSession.results.filter(r => r.status === 'pending').length} pending`}
            </p>
          </div>
          <button type="button" onClick={onResume} className="btn-primary text-xs shrink-0 py-1.5">
            Resume →
          </button>
        </div>
      )}

      {/* File Upload */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-700">Resume *</label>
          {isSaved && (
            <span className="text-xs text-gray-400">
              Saved {formatRelativeTime(savedResume!.savedAt)}
            </span>
          )}
        </div>

        {activeFileName ? (
          <div className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
            isSaved ? 'border-green-200 bg-green-50' : 'border-linkedin-blue bg-linkedin-blue-light'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0">{isParsing ? '⟳' : isSaved ? '💾' : '📄'}</span>
              <div className="min-w-0">
                <p className={`text-xs font-medium truncate ${isSaved ? 'text-green-800' : 'text-linkedin-blue'}`}>
                  {activeFileName}
                </p>
                <p className="text-xs text-gray-400">
                  {isParsing ? 'Extracting text...' : activeFileSize ? `${(activeFileSize / 1024).toFixed(0)} KB` : ''}
                  {isSaved && ' · saved'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Change
              </button>
              <button
                type="button"
                onClick={handleClearResume}
                className="text-xs text-red-400 hover:text-red-600"
                title="Remove"
              >
                ✕
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
              ${isDragging ? 'border-linkedin-blue bg-linkedin-blue-light' : 'border-gray-300 hover:border-gray-400'}`}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="text-xs text-gray-500">
              <p className="font-medium">Drop your resume here</p>
              <p className="text-gray-400">PDF, DOCX, or TXT</p>
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
        <label className="block text-xs font-medium text-gray-700 mb-1">Optimization Mode</label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'job_seeker', label: 'Job Seeker', desc: 'Aggressive keyword optimization' },
            { value: 'visibility', label: 'Visibility', desc: 'Broad recruiter discovery' },
          ] as const).map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={`p-2 rounded-md border text-left transition-colors ${
                mode === m.value
                  ? 'border-linkedin-blue bg-linkedin-blue-light text-linkedin-blue'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium text-xs">{m.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Target Role */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Target Role *</label>
        <input
          type="text"
          className="input-field text-sm"
          placeholder="e.g. Senior Product Manager"
          value={targetRole}
          onChange={(e) => setTargetRole(e.target.value)}
        />
      </div>

      {/* Job Description */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Job Description <span className="text-gray-400">(optional)</span>
        </label>
        <textarea
          className="input-field text-xs resize-none"
          rows={4}
          placeholder="Paste the job description for more targeted optimization..."
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
        />
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}

      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
        Navigate to your <strong>LinkedIn profile page</strong> (linkedin.com/in/…) before clicking Analyze.
      </div>

      <button type="submit" className="btn-primary w-full" disabled={isLoading || isParsing}>
        {isLoading ? 'Starting...' : isParsing ? 'Reading file...' : 'Analyze My Profile'}
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
