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
  if (result.displayTitle) {
    const subtitle = result.displaySubtitle ? ` @ ${result.displaySubtitle}` : '';
    return `${result.displayTitle}${subtitle}`;
  }
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
  const [copiedAll, setCopiedAll] = useState(false);
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


  const copyToClipboard = async (text: string, label: string): Promise<void> => {
    console.log(
      `[Optimizer] Copying "${label}" to clipboard — ${text.length} chars: ` +
      `"${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`
    );
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const experienceResults = session.results.filter(
    (r) => r.section === LinkedInSection.Experience
  );

  const isExperienceItem = currentResult?.section === LinkedInSection.Experience;

  const formatAllExperience = (): string => {
    return experienceResults
      .map((r) => {
        const header = r.displayTitle
          ? `--- ${r.displayTitle}${r.displaySubtitle ? ` @ ${r.displaySubtitle}` : ''} ---`
          : `--- ${r.sectionId} ---`;
        const content = r.status === 'edited' && r.editedContent ? r.editedContent : r.optimized;
        return `${header}\n${content}`;
      })
      .join('\n\n');
  };

  const handleCopyAll = async () => {
    const text = formatAllExperience();
    console.log(`[Optimizer] Copying all experience (${experienceResults.length} items) — ${text.length} chars`);
    await navigator.clipboard.writeText(text);
    setCopiedAll(true);
    // Mark all pending experience results as approved
    for (const r of experienceResults) {
      if (r.status === 'pending') {
        await updateStatus(r, 'approved');
      }
    }
    // Jump to the first section after the last experience item, or finish if none
    const lastExpIdx = session.results.reduce((max, r, i) =>
      r.section === LinkedInSection.Experience ? i : max, -1
    );
    const nextIdx = lastExpIdx + 1; // index right after the last experience result
    setTimeout(() => {
      if (nextIdx < total) {
        setCurrentIndex(nextIdx);
      } else {
        setCurrentIndex(total); // triggers done screen
      }
      setCopiedAll(false);
      setEditMode(false);
    }, 800);
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
      <div className="p-5 flex flex-col gap-5 animate-fade-in">
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-full bg-success-50 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2 className="font-bold text-neutral-900 text-lg tracking-tight">All sections reviewed</h2>
          <p className="text-sm text-neutral-500 mt-1">{copiedCount} suggestion{copiedCount !== 1 ? 's' : ''} copied to clipboard</p>
        </div>
        <button
          onClick={() => { console.log('[Optimizer] Navigating back from done screen'); setCurrentIndex(total - 1); }}
          className="btn-secondary w-full"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Last Section
        </button>
        <button onClick={onComplete} className="btn-primary w-full">View Summary</button>
        <button onClick={onReset} className="btn-ghost w-full text-neutral-500">Start New Session</button>
      </div>
    );
  }

  if (!currentResult) {
    return (
      <div className="p-5 flex flex-col gap-3">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-32 w-full" />
      </div>
    );
  }

  const statusBadge = {
    pending: null,
    approved: <span className="badge-success">Copied</span>,
    edited:   <span className="badge-success">Edited</span>,
    skipped:  <span className="badge-warning">Skipped</span>,
  }[currentResult.status];

  const progressPercent = total > 0 ? (reviewed.length / total) * 100 : 0;

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Progress bar + nav */}
      <div className="px-5 pt-4 pb-3 border-b border-neutral-100 bg-white">
        {/* Section title and navigation */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="btn-ghost !p-1 disabled:opacity-20"
              title="Previous section"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="text-sm font-semibold text-neutral-900 truncate">
              {sectionLabel(currentResult)}
            </span>
            {statusBadge}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-neutral-400 font-medium">
              {reviewed.length}/{total}
            </span>
            <button
              onClick={goNext}
              disabled={currentIndex >= total - 1 && session.results.every((r) => r.status === 'pending')}
              className="btn-ghost !p-1 disabled:opacity-20"
              title="Next section"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
          <div
            className="h-1 bg-brand-700 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Section dots */}
        <div className="flex justify-center gap-1.5 mt-2.5">
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
                'w-2 h-2 rounded-full transition-all duration-150',
                i === currentIndex
                  ? 'bg-brand-700 scale-125'
                  : r.status === 'approved' || r.status === 'edited'
                  ? 'bg-success-500'
                  : r.status === 'skipped'
                  ? 'bg-warning-500'
                  : 'bg-neutral-200 hover:bg-neutral-300',
              ].join(' ')}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        {/* Keywords */}
        {currentResult.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {currentResult.keywords.map((kw) => (
              <span key={kw} className="badge-accent">
                {kw}
              </span>
            ))}
          </div>
        )}

        {/* Before */}
        <div className="card">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Current</span>
          </div>
          <p className="text-sm text-neutral-600 whitespace-pre-wrap leading-relaxed">
            {currentResult.original || <span className="text-neutral-400 italic">Empty section</span>}
          </p>
        </div>

        {/* After / Edit */}
        {editMode ? (
          <div className="card !border-brand-200 !bg-brand-50/30">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-700" />
              <span className="text-xs font-semibold text-brand-700 uppercase tracking-wide">Edit Suggestion</span>
            </div>
            <textarea
              className="w-full text-sm border-0 outline-none resize-none leading-relaxed bg-transparent text-neutral-800"
              rows={8}
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              autoFocus
            />
            <div className="text-xs text-neutral-400 mt-2 tabular-nums">{editedContent.length} characters</div>
          </div>
        ) : (
          <div className="card">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-success-500" />
              <span className="text-xs font-semibold text-success-700 uppercase tracking-wide">Suggested</span>
            </div>
            <DiffView original={currentResult.original} optimized={currentResult.optimized} />
          </div>
        )}

        {/* Reasoning */}
        {currentResult.reasoning && (
          <div>
            <button
              onClick={() => setShowReasoning((p) => !p)}
              className="btn-ghost btn-sm !px-2 !py-1 !text-xs text-neutral-500 gap-1.5"
            >
              <svg
                width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className={`transition-transform duration-150 ${showReasoning ? 'rotate-90' : ''}`}
              >
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              AI Reasoning
            </button>
            {showReasoning && (
              <div className="mt-2 card-muted !p-3 text-xs text-neutral-600 whitespace-pre-wrap leading-relaxed animate-slide-up">
                {currentResult.reasoning}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="border-t border-neutral-200 p-4 bg-white flex flex-col gap-2.5">
        {editMode ? (
          <>
            <div className="flex gap-2">
              <button onClick={handleCopyEdited} className="btn-primary flex-1">
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Copied
                  </>
                ) : 'Copy Edited'}
              </button>
              <button onClick={handleCancelEdit} className="btn-secondary !px-3">
                Cancel
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={goPrev} disabled={currentIndex === 0} className="btn-ghost flex-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                Back
              </button>
              <button onClick={currentIndex === total - 1 ? onComplete : goNext} className="btn-ghost flex-1">
                {currentIndex === total - 1 ? 'Finish' : 'Next'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <button onClick={handleCopy} className="btn-primary flex-1">
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    Copy
                  </>
                )}
              </button>
              <button onClick={handleStartEdit} className="btn-secondary !px-3" title="Edit suggestion">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>
            {isExperienceItem && experienceResults.length > 1 && (
              <button onClick={handleCopyAll} className="btn-secondary w-full">
                {copiedAll ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    All Copied
                  </>
                ) : `Copy All Experience (${experienceResults.length})`}
              </button>
            )}
            <div className="flex gap-2">
              <button onClick={goPrev} disabled={currentIndex === 0} className="btn-ghost flex-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                Back
              </button>
              <button onClick={currentIndex === total - 1 ? onComplete : goNext} className="btn-ghost flex-1">
                {currentIndex === total - 1 ? 'Finish' : 'Skip'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
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
    <p className="text-sm leading-relaxed whitespace-pre-wrap">
      {diffs.map((part, i) => {
        if (part.added) {
          return <mark key={i} className="bg-success-100 text-success-700 rounded-sm px-0.5 not-italic">{part.value}</mark>;
        }
        if (part.removed) {
          return <del key={i} className="text-danger-500 opacity-60 rounded-sm">{part.value}</del>;
        }
        return <span key={i} className="text-neutral-700">{part.value}</span>;
      })}
    </p>
  );
}
