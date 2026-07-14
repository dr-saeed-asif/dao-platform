import { ProposalType } from '@dao-platform/domain';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProposalDto {
  @IsString()
  @MaxLength(100)
  daoId!: string;

  @IsString()
  @Length(3, 200)
  title!: string;

  @IsString()
  @Length(3, 500)
  purpose!: string;

  @IsString()
  @Length(10, 10_000)
  description!: string;

  @IsEnum(ProposalType)
  type!: ProposalType;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  optionLabels!: string[];

  @IsISO8601({ strict: true })
  startsAt!: string;

  @IsISO8601({ strict: true })
  endsAt!: string;

  @IsString()
  @MaxLength(2048)
  metadataURI!: string;

  @Matches(/^0x[0-9a-fA-F]{64}$/)
  metadataHash!: string;
}
