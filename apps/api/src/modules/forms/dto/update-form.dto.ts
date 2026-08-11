import {
  IsString, IsBoolean, IsOptional, IsArray, ValidateNested, IsIn, IsNotEmpty, Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FormFieldDto, FORM_KINDS, SLUG_PATTERN } from './create-form.dto';

export class UpdateFormDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(SLUG_PATTERN, { message: 'slug must contain only lowercase letters, numbers and hyphens' })
  slug?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  schema?: FormFieldDto[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsIn(FORM_KINDS)
  kind?: (typeof FORM_KINDS)[number];
}
