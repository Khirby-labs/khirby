import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class DraftSystemPromptDto {
  @IsString()
  @IsNotEmpty()
  brief: string;

  @IsOptional()
  @IsString()
  locale?: string;
}

class PreviewChatMessageDto {
  @IsIn(['visitor', 'assistant'])
  role: 'visitor' | 'assistant';

  @IsString()
  @IsNotEmpty()
  content: string;
}

export class PreviewChatDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreviewChatMessageDto)
  messages: PreviewChatMessageDto[];

  @IsString()
  @IsNotEmpty()
  content: string;
}

export class PlanQuestionsDto {
  @IsString()
  @IsNotEmpty()
  openingMessage: string;

  @IsOptional()
  @IsString()
  locale?: string;
}
