import { useState, useCallback, useEffect } from 'react';
import * as Diff from 'diff';
import type { OptimizationSession, OptimizationResult } from '../../shared/types';
import { LinkedInSection } from '../../shared/types';
import { sendToServiceWorker } from '../../shared/messaging';
import type { UpdateResultStatusPayload } from '../../shared/messaging';

interface Props {
  session: OptimizationSession;
  onComplete: () => void;
  onReset: () => void;
}

const SECTION_LABELS: Record<LinkedInSection, string> = {
  [LinkedInSection.Headline]: 'Headline',
  [LinkedInSection.About]: 'About / Summary',
  [LinkedInSection.Experience]: 'Experience',
  [LinkedInSection.Skills]: 'Skills',
  [LinkedInSection.Education]: 'Education',
  [LinkedInSection.Certifications]: 'Certifications',
};

function sectionLabel(result: OptimizationResult): string {
  const base = SECTION_LABELS[result.section];
  return result.sectionId ? `${base} (${result.sectionId})` : base;
}

export default function SectionReview({ session, onComplete, onReset }: Props) {
  const total = session.results.length;

  // Initialize at the first pending result, or 0 if all reviewed
  const [currentIndex, setCurrentIndex] = useState(() => {
    const firstPending = session.results.findIndex((r) => r.status === 'pending');
    const idx = firstPending >= 0 ? firstPending : 0;
    console.log(
      `[Optimizer] Review loaded — ${total} sections total, starting at index ${idx}` +
      ` (first pending: ${firstPending >= 0 ? firstPending : 'none'})`
    );
    return idx;
  });

  const [editMode, setEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);

  const reviewed = session.results.filter((r) => r.status !== 'pending');

  // currentIndex === total means "past the last section" → done screen
  const isDone = currentIndex >= total;
  const currentResult: OptimizationResult | null = isDone ? null : session.results[currentIndex];

  // Log whenever the visible section changes
  useEffect(() => {
    if (isDone) {
      const copied = session.results.filter((r) => r.status === 'approved' || r.status === 'edited').length;
      const skipped = session.results.filter((r) => r.status === 'skipped').length;
      console.log(`[Optimizer] All sections reviewed — ${copied} copied, ${skipped} skipped`);
    } else if (currentResult) {
      console.log(
        `[Optimizer] Viewing section ${currentIndex + 1}/${total}: ` +
        `"${sectionLabel(currentResult)}" — status: ${currentResult.status}, ` +
        `original: ${currentResult.original.length} chars, optimized: ${currentResult.optimized.length} chars`
      );
    }
  }, [currentIndex]);

  const updateStatus = useCallback(
    async (
      result: OptimizationResult,
      status: OptimizationResult['status'],
      edited?: string
    ) => {
      console.log(
        `[Optimizer] Marking "${sectionLabel(result)}" as ${status}` +
        (edited ? ` (edited: ${edited.length} chars)` : '')
      );
      const payload: UpdateResultStatusPayload = {
        section: result.section,
        sectionId: result.sectionId,
        status,
        editedContent: edited,
      };
      await sendToServiceWorker({ action: 'UPDATE_RESULT_STATUS', payload });
    },
    []
  );

  const advance = () => {
    setCurrentIndex((i) => i + 1);
    setEditMode(false);
    setCopied(false);
    setShowReasoning(false);
  };

  const copyToClipboard = async (text: string, label: string): Promise<void> => {
    console.log(
      `[Optimizer] Copying "${label}" to clipboard — ${text.length} chars: ` +
      `"${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`
    );
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopy = async () => {
    if (!currentResult) return;
    await copyToClipboard(currentResult.optimized, sectionLabel(currentResult));
    await updateStatus(currentResult, 'approved');
  };

  const handleCopyEdited = async () => {
    if (!currentResult || !editedContent.trim()) return;
    await copyToClipboard(editedContent, sectionLabel(currentResult));
    await updateStatus(currentResult, 'edited', editedContent);
    setEditMode(false);
  };

  const handleStartEdit = () => {
    if (!currentResult) return;
    console.log(
      `[Optimizer] Entering edit mode for "${sectionLabel(currentResult)}" — ` +
      `pre-filling with optimized text (${currentResult.optimized.length} chars)`
    );
    setEditedContent(currentResult.optimized);
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    console.log(`[Optimizer] Edit mode cancelled`);
    setEditMode(false);
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      console.log(`[Optimizer] Navigating back → section ${currentIndex - 1 + 1}/${total}`);
      setCurrentIndex((i) => i - 1);
      setEditMode(false);
      setCopied(false);
      setShowReasoning(false);
    }
  };

  const goNext = () => {
    if (currentIndex < total) {
      console.log(`[Optimizer] Navigating forward → section ${currentIndex + 1 + 1}/${total}`);
      setCurrentIndex((i) => i + 1);
      setEditMode(false);
      setCopied(false);
      setShowReasoning(false);
    }
  };

  // Done screen
  if (isDone) {
    const copiedCount = session.results.filter((r) => r.status === 'approved' || r.status === 'edited').length;
    return (
      <div className="p-4 flex flex-col gap-4">
        <div className="text-center py-6">
          <div className="text-3xl mb-2">✓</div>
          <h2 className="font-semibold text-gray-900">All sections reviewed!</h2>
          <p className="text-xs text-gray-500 mt-1">{copiedCount} suggestions copied</p>
        </div>
        <button
          onClick={() => { console.log('[Optimizer] Navigating back from done screen'); setCurrentIndex(total - 1); }}
          className="btn-secondary text-xs w-full"
        >
          ← Back to Last Section
        </button>
        <button onClick={onComplete} className="btn-primary w-full">View Summary</button>
        <button onClick={onReset} className="btn-secondary text-xs w-full">Start New Session</button>
      </div>
    );
  }

  if (!currentResult) {
    return <div className="p-4 text-xs text-gray-500">Loading...</div>;
  }

  const statusBadge = {
    pending: null,
    approved: <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Copied</span>,
    edited:   <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Copied (edited)</span>,
    skipped:  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Skipped</span>,
  }[currentResult.status];

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar + nav */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <div className="flex items-center gap-1.5">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed px-1"
              title="Previous section"
            >
              ‹
            </button>
            <span>
              {sectionLabel(currentResult)}
            </span>
            {statusBadge}
          </div>
          <div className="flex items-center gap-1.5">
            <span>{reviewed.length}/{total} reviewed</span>
            <button
              onClick={goNext}
              disabled={currentIndex >= total - 1 && session.results.every((r) => r.status === 'pending')}
              className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed px-1"
              title="Next section"
            >
              ›
            </button>
          </div>
        </div>
        <div className="h-1 bg-gray-200 rounded-full">
          <div
            className="h-1 bg-linkedin-blue rounded-full transition-all"
            style={{ width: `${total > 0 ? (reviewed.length / total) * 100 : 0}%` }}
          />
        </div>
        {/* Section dots */}
        <div className="flex justify-center gap-1 mt-2">
          {session.results.map((r, i) => (
            <button
              key={i}
              onClick={() => {
                console.log(`[Optimizer] Jumping to section ${i + 1}/${total}: "${sectionLabel(r)}"`);
                setCurrentIndex(i);
                setEditMode(false);
                setCopied(false);
                setShowReasoning(false);
              }}
              title={sectionLabel(r)}
              className={[
                'w-2 h-2 rounded-full transition-all',
                i === currentIndex
                  ? 'bg-linkedin-blue scale-125'
                  : r.status === 'approved' || r.status === 'edited'
                  ? 'bg-green-400'
                  : r.status === 'skipped'
                  ? 'bg-amber-300'
                  : 'bg-gray-300',
              ].join(' ')}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {/* Keywords */}
        {currentResult.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {currentResult.keywords.map((kw) => (
              <span
                key={kw}
                className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100"
              >
                {kw}
              </span>
            ))}
          </div>
        )}

        {/* Before */}
        <div className="card">
          <div className="text-xs font-medium text-gray-600 mb-2">Before</div>
          <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
            {currentResult.original || <span className="text-gray-400 italic">(empty)</span>}
          </p>
        </div>

        {/* After / Edit */}
        {editMode ? (
          <div className="card border-linkedin-blue">
            <div className="text-xs font-medium text-linkedin-blue mb-2">Edit Suggestion</div>
            <textarea
              className="w-full text-xs border-0 outline-none resize-none leading-relaxed"
              rows={8}
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              autoFocus
            />
            <div className="text-xs text-gray-400 mt-1">{editedContent.length} characters</div>
          </div>
        ) : (
          <div className="card">
            <div className="text-xs font-medium text-green-700 mb-2">AI Suggestion</div>
            <DiffView original={currentResult.original} optimized={currentResult.optimized} />
          </div>
        )}

        {/* Reasoning */}
        {currentResult.reasoning && (
          <div>
            <button
              onClick={() => setShowReasoning((p) => !p)}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <span>{showReasoning ? '▼' : '▶'}</span> AI Reasoning
            </button>
            {showReasoning && (
              <div className="mt-1 text-xs text-gray-600 bg-gray-50 rounded p-2 whitespace-pre-wrap">
                {currentResult.reasoning}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="border-t border-gray-200 p-3 flex flex-col gap-2">
        {editMode ? (
          <>
            <div className="flex gap-2">
              <button onClick={handleCopyEdited} className="btn-primary flex-1 text-xs">
                {copied ? 'Copied!' : 'Copy Edited'}
              </button>
              <button onClick={handleCancelEdit} className="btn-secondary text-xs px-3">
                Cancel
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={goPrev} disabled={currentIndex === 0} className="btn-secondary flex-1 text-xs disabled:opacity-40">
                ← Back
              </button>
              <button onClick={currentIndex === total - 1 ? onComplete : goNext} className="btn-secondary flex-1 text-xs">
                {currentIndex === total - 1 ? 'Finish →' : 'Next →'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <button onClick={handleCopy} className="btn-primary flex-1 text-xs">
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button onClick={handleStartEdit} className="btn-secondary text-xs px-3">
                ✎ Edit
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={goPrev} disabled={currentIndex === 0} className="btn-secondary flex-1 text-xs disabled:opacity-40">
                ← Back
              </button>
              <button onClick={currentIndex === total - 1 ? onComplete : goNext} className="btn-secondary flex-1 text-xs">
                {currentIndex === total - 1 ? 'Finish →' : 'Next →'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DiffView({ original, optimized }: { original: string; optimized: string }) {
  const diffs = Diff.diffWords(original, optimized);
  return (
    <p className="text-xs leading-relaxed whitespace-pre-wrap">
      {diffs.map((part, i) => {
        if (part.added) {
          return <mark key={i} className="bg-green-100 text-green-900 not-italic">{part.value}</mark>;
        }
        if (part.removed) {
          return <del key={i} className="text-red-400 opacity-70">{part.value}</del>;
        }
        return <span key={i}>{part.value}</span>;
      })}
    </p>
  );
}
