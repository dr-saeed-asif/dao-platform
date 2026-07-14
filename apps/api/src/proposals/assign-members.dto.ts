import { ArrayMaxSize, ArrayMinSize, IsArray, Matches } from 'class-validator';

export class AssignMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @Matches(/^0x[0-9a-fA-F]{40}$/, { each: true })
  memberAddresses!: string[];
}
