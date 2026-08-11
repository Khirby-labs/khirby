import { IsString, IsOptional, IsUUID, IsIn, IsEmail } from 'class-validator';

/** Body for POST /mail/threads/:id/capture-as-lead — email optional (defaults to inbound From). */
export class CaptureAsLeadDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  priority?: 'low' | 'medium' | 'high';

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;
}
