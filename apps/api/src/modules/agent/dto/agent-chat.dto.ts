import { IsOptional, IsString, IsUUID, IsNotEmpty, MaxLength, IsIn } from 'class-validator';
import { SUPPORTED_LOCALE_CODES } from '../../../../../../packages/types/src';

export class AgentChatDto {
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content: string;

  /** Active CRM UI language — reply language follows this after tool calls. */
  @IsOptional()
  @IsIn(SUPPORTED_LOCALE_CODES as unknown as string[])
  locale?: string;
}
