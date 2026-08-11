import { IsString, IsOptional, IsInt, IsUUID, Min, Max, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class ListThreadsQueryDto {
  @IsUUID()
  @IsOptional()
  contactId?: string;

  @IsUUID()
  @IsOptional()
  leadId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  pageSize?: number = 20;
}

export class CreateThreadDto {
  @IsUUID()
  @IsOptional()
  contactId?: string;

  @IsUUID()
  @IsOptional()
  leadId?: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  bodyText!: string;

  /** Recipient email — required when contactId not provided */
  @IsString()
  @IsOptional()
  toAddress?: string;
}

export class ReplyThreadDto {
  @IsString()
  @IsNotEmpty()
  bodyText!: string;
}
