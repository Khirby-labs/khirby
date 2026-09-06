import { IsIn } from 'class-validator';
import type { CustomFieldEntity } from '../../../core/database/schema';

const ENTITIES = ['contact'] as const;

export class ListCustomFieldsQueryDto {
  @IsIn([...ENTITIES])
  entity: CustomFieldEntity;
}
