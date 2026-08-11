import { IsString, IsOptional, IsBoolean, IsInt, Min, Matches } from 'class-validator';

export class CreatePipelineStageDto {
  @IsString()
  name: string;

  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsBoolean()
  isWon?: boolean;

  @IsOptional()
  @IsBoolean()
  isLost?: boolean;
}
