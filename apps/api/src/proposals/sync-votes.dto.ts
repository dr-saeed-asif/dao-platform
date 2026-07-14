import { IsBoolean, IsOptional } from 'class-validator';

export class SyncVotesDto {
  @IsOptional()
  @IsBoolean()
  full?: boolean;
}
