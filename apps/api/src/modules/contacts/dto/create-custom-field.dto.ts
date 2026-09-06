import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { CustomFieldEntity, CustomFieldType } from '../../../core/database/schema';

const ENTITIES = ['contact'] as const;
const TYPES = ['text', 'number', 'date', 'select'] as const;

export class CreateCustomFieldDto {
  @IsIn([...ENTITIES])
  entity: CustomFieldEntity;

  @IsString()
  @MinLength(1)
  name: string;

  @IsIn([...TYPES])
  type: CustomFieldType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  options?: string[];
}
