import { IsArray, IsObject } from 'class-validator';

export class ImportContactsDto {
  /** CRM field (`email` / `name` / `phone` / custom slug) → CSV column header. */
  @IsObject()
  mapping: Record<string, string>;

  @IsArray()
  @IsObject({ each: true })
  rows: Record<string, unknown>[];
}
