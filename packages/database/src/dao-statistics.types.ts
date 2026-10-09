export interface DaoStatisticsQuery {
  daoId: string | null;
}

export interface DaoStatisticsResult {
  proposalCount: number;
  voteCount: number;
  memberCount: number;
  artefactCount: number;
  asOf: string;
  chainId: string;
  contractAddress: string;
  daoId: string | null;
  evidenceIds: string[];
}