import { IsEmail, IsOptional, IsString, IsObject } from 'class-validator';

export class UpdateContactDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  /** Merged into `metadata.custom` via jsonb_set — never a full metadata rewrite. */
  @IsOptional()
  @IsObject()
  custom?: Record<string, unknown>;
}
