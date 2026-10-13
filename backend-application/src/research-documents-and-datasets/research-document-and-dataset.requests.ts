import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsIn, IsISO8601, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ProposalType } from '@dao-platform/domain';

export class EvidenceIdsDto {
  @IsArray() @ArrayMaxSize(20) @ArrayUnique() @Matches(/^artefact:sha256:[0-9a-f]{64}$/, { each: true })
  evidenceIds!: string[];
}
export class ManifestDto extends EvidenceIdsDto {
  @IsString() @MinLength(1) @MaxLength(100) daoId!: string;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(3) @MaxLength(500) purpose!: string;
  @IsString() @MinLength(10) @MaxLength(10_000) description!: string;
  @IsEnum(ProposalType) proposalType!: ProposalType;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(10) @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(100, { each: true }) options!: string[];
  @IsISO8601() startsAt!: string;
  @IsISO8601() endsAt!: string;
}
export class ArtefactStateDto extends EvidenceIdsDto {
  @IsIn(['PENDING_CHAIN', 'FAILED', 'ORPHANED']) state!: 'PENDING_CHAIN' | 'FAILED' | 'ORPHANED';
}
export class LinkArtefactsDto extends EvidenceIdsDto {
  @IsOptional() @Matches(/^(0|[1-9][0-9]*)$/) onChainProposalId?: string;
  @IsOptional() @IsString() creationEvidenceId?: string;
}
export class CreateDatasetDto {
  @IsString() @MinLength(1) @MaxLength(200) version!: string;
  @IsOptional() @IsString() description?: string;
  @Matches(/^(0|[1-9][0-9]*)$/) chainId!: string;
  @Matches(/^0x[0-9a-fA-F]{40}$/) contractAddress!: string;
  @Matches(/^(0|[1-9][0-9]*)$/) startBlock!: string;
  @IsOptional() @IsString() policyVersion?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
export class FreezeDatasetDto {
  @Matches(/^(0|[1-9][0-9]*)$/) endBlock!: string;
  @Matches(/^0x[0-9a-fA-F]{64}$/) endBlockHash!: string;
}
