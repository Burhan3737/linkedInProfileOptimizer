import type { OptimizationSession } from '../../shared/types';
import { LinkedInSection } from '../../shared/types';

interface Props {
  session: OptimizationSession | null;
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

export default function SummaryScreen({ session, onReset }: Props) {
  if (!session) {
    return (
      <div className="p-5 flex flex-col gap-3">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-20 w-full" />
        <div className="skeleton h-20 w-full" />
      </div>
    );
  }

  const applied = session.results.filter(
    (r) => r.status === 'approved' || r.status === 'edited'
  );
  const skipped = session.results.filter((r) => r.status === 'skipped');

  const allKeywords = Array.from(
    new Set(applied.flatMap((r) => r.keywords))
  );

  return (
    <div className="flex flex-col gap-6 p-5 animate-fade-in">
      {/* Hero */}
      <div className="text-center py-6">
        <div className="w-16 h-16 rounded-2xl bg-success-50 flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h2 className="font-bold text-xl text-neutral-900 tracking-tight">Profile Optimized</h2>
        <p className="text-sm text-neutral-500 mt-1.5">
          {applied.length} section{applied.length !== 1 ? 's' : ''} updated
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard value={applied.length} label="Applied" variant="success" />
        <StatCard value={skipped.length} label="Skipped" variant="neutral" />
        <StatCard value={allKeywords.length} label="Keywords" variant="brand" />
      </div>

      {/* Changed sections */}
      {applied.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Changed Sections</h3>
          <div className="flex flex-col gap-2">
            {applied.map((r) => (
              <div
                key={`${r.section}-${r.sectionId ?? ''}`}
                className="flex items-center justify-between p-3 bg-white rounded-xl border border-neutral-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-success-50 flex items-center justify-center shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <span className="text-sm font-medium text-neutral-800">
                    {r.displayTitle
                      ? `${r.displayTitle}${r.displaySubtitle ? ` @ ${r.displaySubtitle}` : ''}`
                      : `${SECTION_LABELS[r.section]}${r.sectionId ? ` (${r.sectionId})` : ''}`
                    }
                  </span>
                </div>
                <span className="badge-success text-xs">
                  {r.status === 'edited' ? 'Edited' : 'Applied'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keywords added */}
      {allKeywords.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Keywords Added</h3>
          <div className="flex flex-wrap gap-1.5">
            {allKeywords.map((kw) => (
              <span key={kw} className="badge-accent">
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2.5 mt-1">
        {session.profileData?.profileUrl && (
          <a
            href={session.profileData.profileUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-primary text-center no-underline"
          >
            View Your LinkedIn Profile
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        )}
        <button onClick={onReset} className="btn-secondary">
          Optimize Again
        </button>
      </div>
    </div>
  );
}

function StatCard({
  value,
  label,
  variant,
}: {
  value: number;
  label: string;
  variant: 'success' | 'neutral' | 'brand';
}) {
  const styles = {
    success: 'bg-success-50 border-success-100',
    neutral: 'bg-neutral-50 border-neutral-200',
    brand:   'bg-accent-50 border-accent-100',
  };

  const valueStyles = {
    success: 'text-success-700',
    neutral: 'text-neutral-600',
    brand:   'text-accent-600',
  };

  return (
    <div className={`rounded-xl border p-3.5 text-center ${styles[variant]}`}>
      <div className={`text-2xl font-bold tabular-nums ${valueStyles[variant]}`}>{value}</div>
      <div className="text-xs text-neutral-500 mt-0.5 font-medium">{label}</div>
    </div>
  );
}
