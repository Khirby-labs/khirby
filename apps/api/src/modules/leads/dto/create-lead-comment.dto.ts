import { IsString, MinLength } from 'class-validator';

export class CreateLeadCommentDto {
  @IsString()
  @MinLength(1)
  body: string;
}
