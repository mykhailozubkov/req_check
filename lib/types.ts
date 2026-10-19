export type FindingType = 'ambiguity' | 'missing_criteria' | 'conflict';
export type Finding = {
  id: string;
  type: FindingType;
  priority: 'high' | 'medium' | 'low';
  certainty: 'confirmed' | 'needs_context';
  title: string;
  evidence: string[];
  explanation: string;
  question: string;
  suggestion: string;
};
export type Review = {
  summary: string;
  strengths: string[];
  findings: Finding[];
  rewrite: string;
  changes: { kind: 'editorial' | 'decision_required' | 'ba_decision'; description: string }[];
  openQuestions: { findingId: string; question: string }[];
  meta: { provider: string; model: string; policyVersion: string; generatedAt: string; demo: boolean };
};
