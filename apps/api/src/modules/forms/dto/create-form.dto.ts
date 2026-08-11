import {
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
  IsIn,
  IsNotEmpty,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FORM_FIELD_TYPES } from '../validate-submission-data';

export const FORM_KINDS = ['contact', 'waitlist', 'wishlist', 'feedback'] as const;

/** Slug: lowercase letters, digits and hyphens only — mirrors the builder's input pattern. */
export const SLUG_PATTERN = /^[a-z0-9-]+$/;
const SLUG_MESSAGE = 'slug must contain only lowercase letters, numbers and hyphens';

/** Optional per-locale visitor labels (ADR-0025). */
export class FormFieldLabelsDto {
  @IsOptional()
  @IsString()
  en?: string;

  @IsOptional()
  @IsString()
  pl?: string;
}

export class FormFieldDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  /** Required fallback (= EN / legacy). */
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FormFieldLabelsDto)
  labels?: FormFieldLabelsDto;

  @IsIn([...FORM_FIELD_TYPES])
  type: string;

  @IsBoolean()
  required: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}

export class CreateFormDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  schema: FormFieldDto[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsIn(FORM_KINDS)
  kind?: (typeof FORM_KINDS)[number];
}
