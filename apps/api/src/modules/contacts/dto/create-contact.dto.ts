import { IsEmail, IsOptional, IsString, IsObject } from 'class-validator';

export class CreateContactDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  /** Merged into `metadata.custom` after coerce — never a full metadata rewrite. */
  @IsOptional()
  @IsObject()
  custom?: Record<string, unknown>;
}
