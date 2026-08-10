import { IsString, IsNotEmpty, IsNumber, IsOptional, MinLength, IsEnum, IsArray, ArrayMinSize, Min, Max } from 'class-validator';

export class AssignPanelDto {
  @IsString()
  @IsNotEmpty()
  project_code: string;

  @IsString()
  @IsNotEmpty()
  frame_id: string;

  @IsNumber()
  @Min(1)
  technician_id: number;
}

export class CableActionDto {
  @IsEnum(['skip', 'source_end_open', 'destination_end_open', 'flag_issue', 'reset_all', 'complete'])
  action: 'skip' | 'source_end_open' | 'destination_end_open' | 'flag_issue' | 'reset_all' | 'complete';

  @IsNumber()
  @Min(0)
  cable_index: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  reason?: string;

  @IsOptional()
  @IsString()
  issue_note?: string;
}

export class MidChangeDto {
  @IsString()
  @IsNotEmpty()
  project_code: string;

  @IsString()
  @IsNotEmpty()
  source_frame_id: string;

  @IsNumber()
  @Min(1)
  target_technician_id: number;

  @IsEnum(['direct_transfer', 'interchange'])
  transfer_type: 'direct_transfer' | 'interchange';

  @IsString()
  @MinLength(3)
  reason: string;
}

export class PausePanelDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ResumePanelDto {
  @IsOptional()
  @IsString()
  otp?: string;

  @IsOptional()
  @IsString()
  qr_token?: string;
}
