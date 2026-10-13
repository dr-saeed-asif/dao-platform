import { Matches } from 'class-validator';

export class ConfirmVoteDto {
  @Matches(/^0x[0-9a-fA-F]{64}$/)
  transactionHash!: string;
}
