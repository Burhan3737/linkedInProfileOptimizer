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
    return <div className="p-4 text-xs text-gray-500">No session data.</div>;
  }

  const applied = session.results.filter(
    (r) => r.status === 'approved' || r.status === 'edited'
  );
  const skipped = session.results.filter((r) => r.status === 'skipped');

  const allKeywords = Array.from(
    new Set(applied.flatMap((r) => r.keywords))
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-center py-4">
        <div className="text-4xl mb-2">🎉</div>
        <h2 className="font-semibold text-lg text-gray-900">Profile Optimized!</h2>
        <p className="text-xs text-gray-500 mt-1">
          {applied.length} section{applied.length !== 1 ? 's' : ''} updated
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard value={applied.length} label="Applied" color="green" />
        <StatCard value={skipped.length} label="Skipped" color="gray" />
        <StatCard value={allKeywords.length} label="Keywords" color="blue" />
      </div>

      {/* Changed sections */}
      {applied.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-700 mb-2">Changed Sections</h3>
          <div className="flex flex-col gap-1">
            {applied.map((r) => (
              <div
                key={`${r.section}-${r.sectionId ?? ''}`}
                className="flex items-center justify-between text-xs p-2 bg-green-50 rounded border border-green-100"
              >
                <span className="font-medium text-green-800">
                  {SECTION_LABELS[r.section]}
                  {r.sectionId ? ` (${r.sectionId})` : ''}
                </span>
                <span className="text-green-600">
                  {r.status === 'edited' ? 'Edited & Applied' : 'Applied'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keywords added */}
      {allKeywords.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-700 mb-2">Keywords Added</h3>
          <div className="flex flex-wrap gap-1">
            {allKeywords.map((kw) => (
              <span
                key={kw}
                className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* View on LinkedIn */}
      {session.profileData?.profileUrl && (
        <a
          href={session.profileData.profileUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-primary text-center text-xs no-underline"
          onClick={() => chrome.tabs.create({ url: session.profileData!.profileUrl })}
        >
          View Your LinkedIn Profile →
        </a>
      )}

      <button onClick={onReset} className="btn-secondary text-xs">
        Optimize Again
      </button>
    </div>
  );
}

function StatCard({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: 'green' | 'gray' | 'blue';
}) {
  const colorMap = {
    green: 'bg-green-50 text-green-700 border-green-100',
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
  };

  return (
    <div className={`rounded-lg border p-3 text-center ${colorMap[color]}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs mt-0.5">{label}</div>
    </div>
  );
}
