import { IsOptional, IsInt, IsString, IsIn, IsBoolean, Min, Max, IsUUID } from 'class-validator';
import { Type, Transform } from 'class-transformer';

const SORT_BY = ['email', 'name', 'phone', 'createdAt'] as const;
const SORT_DIR = ['asc', 'desc'] as const;
const NEWSLETTER = ['synced', 'missing'] as const;

export class ListContactsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn([...SORT_BY])
  sortBy?: (typeof SORT_BY)[number];

  @IsOptional()
  @IsIn([...SORT_DIR])
  sortDir?: (typeof SORT_DIR)[number];

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : undefined))
  @IsBoolean()
  hasPhone?: boolean;

  @IsOptional()
  @IsUUID()
  formId?: string;

  @IsOptional()
  @IsIn([...NEWSLETTER])
  newsletter?: (typeof NEWSLETTER)[number];

  @IsOptional()
  @IsString()
  createdFrom?: string;

  @IsOptional()
  @IsString()
  createdTo?: string;
}
