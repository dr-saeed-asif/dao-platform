export interface ComplianceResult {
  ruleId: 'GOV-01' | 'GOV-02' | 'GOV-03' | 'GOV-04' | 'GOV-05' | 'GOV-06';
  result: 'PASS' | 'FAIL' | 'INDETERMINATE';
  reason?: string;
  inputs?: Record<string, unknown>;
  policyVersion?: string | null;
  evidenceIds: string[];
  explanationData?: Record<string, unknown>;
}

