import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ALL_PERMISSIONS } from '../permission-catalog';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

@ValidatorConstraint({ name: 'isValidPermissionPair', async: false })
class IsValidPermissionPairConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const obj = args.object as { resource?: string; action?: string };
    if (!obj.resource || !obj.action) return true;
    return ALL_PERMISSIONS.some((p) => p.resource === obj.resource && p.action === obj.action);
  }

  defaultMessage() {
    return 'permission pair is not in the catalog';
  }
}

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
  @Validate(IsValidPermissionPairConstraint)
  resource: string;

  @IsString()
  action: string;
}

export class SetPermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionDto)
  permissions: PermissionDto[];
}
