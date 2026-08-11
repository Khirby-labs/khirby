import {
  IsString,
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
  Max,
  IsNotEmpty,
  IsEmail,
} from 'class-validator';

export class UpsertMailboxDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  fromName!: string;

  @IsEmail()
  @IsNotEmpty()
  fromAddress!: string;

  @IsString()
  @IsNotEmpty()
  imapHost!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  imapPort!: number;

  @IsBoolean()
  imapSecure!: boolean;

  @IsString()
  @IsNotEmpty()
  imapUser!: string;

  /** Optional: omit to keep existing password */
  @IsString()
  @IsOptional()
  imapPassword?: string;

  @IsString()
  @IsNotEmpty()
  smtpHost!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort!: number;

  @IsBoolean()
  smtpSecure!: boolean;

  @IsString()
  @IsNotEmpty()
  smtpUser!: string;

  /** Optional: omit to keep existing password */
  @IsString()
  @IsOptional()
  smtpPassword?: string;

  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  backfillDays?: number;
}
