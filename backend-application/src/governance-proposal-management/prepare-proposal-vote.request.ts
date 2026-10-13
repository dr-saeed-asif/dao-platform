import { IsInt, Max, Min } from 'class-validator';

export class PrepareVoteDto {
  @IsInt()
  @Min(0)
  @Max(9)
  optionIndex!: number;
}
