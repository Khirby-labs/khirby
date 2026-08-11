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
}
