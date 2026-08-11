import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';

export class ReorderPipelineStagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  stageIds: string[];
}
