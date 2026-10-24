import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class WalletChallengeDto {
  @IsString() @Matches(/^0x[0-9a-fA-F]{40}$/) address!: string;
  @IsOptional() @IsIn(['metamask', 'cyberchain']) kind?:
    'metamask' | 'cyberchain';
}
export class WalletLoginDto {
  @IsString() @Matches(/^[0-9a-f]{64}$/) nonce!: string;
  @IsOptional() @IsString() @MaxLength(300) signature?: string;
  @IsOptional() @IsString() @MaxLength(40000) signedTransaction?: string;
}
export class AssistantConversationDto {
  @IsString() @MinLength(1) @MaxLength(120) proposalId!: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
}
export class AssistantAskDto extends AssistantConversationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(/\S/, { each: true })
  @MaxLength(4000, { each: true })
  question!: string[];
  @IsOptional() @IsUUID() conversation_id?: string;
  @IsOptional() @IsInt() @Min(1) @Max(8) top_k?: number;
}
