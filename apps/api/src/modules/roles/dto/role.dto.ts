import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import {
  PERMISSION_RESOURCES,
  PERMISSION_ACTIONS,
} from '../permission-catalog';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateRoleDto {
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @Transform(trim)
  @MaxLength(500)
  description?: string;
}

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @Transform(trim)
  @MaxLength(500)
  description?: string;
}

class PermissionDto {
  @IsString()
  @IsIn(PERMISSION_RESOURCES as unknown as string[])
  resource: string;

  @IsString()
  @IsIn(PERMISSION_ACTIONS as unknown as string[])
  action: string;
}

export class SetPermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionDto)
  permissions: PermissionDto[];
}
