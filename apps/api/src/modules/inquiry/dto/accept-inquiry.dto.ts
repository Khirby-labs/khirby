import { IsOptional, IsUUID } from 'class-validator';

export class AcceptInquiryDto {
  @IsOptional()
  @IsUUID()
  stageId?: string;
}
