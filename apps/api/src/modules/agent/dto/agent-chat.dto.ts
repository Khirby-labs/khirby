import { IsOptional, IsString, IsUUID, IsNotEmpty, MaxLength } from 'class-validator';

export class AgentChatDto {
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content: string;
}
