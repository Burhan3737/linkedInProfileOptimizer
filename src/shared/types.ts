// ─── Resume Data ────────────────────────────────────────────────────────────

export interface WorkExperience {
  company: string;
  title: string;
  startDate: string;
  endDate: string | null; // null = present
  description: string;
  bullets: string[];
  location?: string;
}

export interface Education {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  gpa?: string;
  activities?: string;
}

export interface Certification {
  name: string;
  issuer: string;
  date?: string;
}

export interface ResumeData {
  rawText: string;
  fullName?: string;
  headline?: string;
  summary?: string;
  workExperience: WorkExperience[];
  education: Education[];
  skills: string[];
  certifications: Certification[];
  languages?: string[];
}

// ─── LinkedIn Profile ────────────────────────────────────────────────────────

export interface LinkedInExperience {
  id: string;
  title: string;
  company: string;
  duration: string;
  description: string;
  element?: Element;
}

export interface LinkedInEducation {
  id: string;
  school: string;
  degree: string;
  field: string;
  duration: string;
  element?: Element;
}

export interface CurrentProfileData {
  profileUrl: string;
  fullName: string;
  headline: string;
  about: string;
  experience: LinkedInExperience[];
  education: LinkedInEducation[];
  skills: string[];
  certifications: string[];
  scrapedAt: number;
}

// ─── Optimization ────────────────────────────────────────────────────────────

export enum LinkedInSection {
  Headline = 'headline',
  About = 'about',
  Experience = 'experience',
  Skills = 'skills',
  Education = 'education',
  Certifications = 'certifications',
}

export type OptimizationMode = 'job_seeker' | 'visibility';

export interface OptimizationResult {
  section: LinkedInSection;
  sectionId?: string; // for experience/education items
  displayTitle?: string; // e.g. "Software Engineer"
  displaySubtitle?: string; // e.g. "Google"
  original: string;
  optimized: string;
  reasoning: string;
  keywords: string[];
  status: 'pending' | 'approved' | 'edited' | 'skipped';
  editedContent?: string;
}

export interface GapAnalysis {
  missingKeywords: string[];
  emptySections: LinkedInSection[];
  skillGaps: string[];
  inconsistencies: string[];
  recommendations: string[];
}

export interface OptimizationSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  mode: OptimizationMode;
  targetRole: string;
  jobDescription?: string;
  resumeData?: ResumeData;
  profileData?: CurrentProfileData;
  gapAnalysis?: GapAnalysis;
  results: OptimizationResult[];
  appliedSections: string[];
  status: 'idle' | 'parsing' | 'scraping' | 'analyzing' | 'optimizing' | 'reviewing' | 'applying' | 'complete' | 'error';
  error?: string;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface UserSettings {
  groqApiKey: string;
  groqModel: string;
  autoOpenSidePanel: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  groqApiKey: '',
  groqModel: 'llama-3.1-8b-instant',
  autoOpenSidePanel: true,
};

// ─── Pipeline Steps ───────────────────────────────────────────────────────────

export interface PipelineStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
}
