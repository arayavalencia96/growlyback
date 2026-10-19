import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import type { TransferIntent } from '../transfer.contracts';
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class TransferIdDto {
  @IsUUID() id: string;
}

export class TransferKeyDto {
  @IsUUID() idempotencyKey: string;
}

export class FindTransfersDto {
  @IsMongoId() goalId: string;
  @IsOptional() @IsIn(['pending', 'completed', 'rejected']) status?:
    'pending' | 'completed' | 'rejected';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}

export class TransferContextDto {
  @IsMongoId() goalId: string;
}
export class TransferEndpointDto {
  @IsMongoId() goalId: string;
  @IsString() @IsNotEmpty() @MaxLength(80) platform: string;
}
export class CreateTransferDto {
  @IsIn(['cash', 'crypto']) kind: 'cash' | 'crypto';
  @IsUUID() idempotencyKey: string;
  @IsDefined()
  @ValidateNested()
  @Type(() => TransferEndpointDto)
  source: TransferEndpointDto;
  @IsDefined()
  @ValidateNested()
  @Type(() => TransferEndpointDto)
  destination: TransferEndpointDto;
  @IsString() @MaxLength(40) fee: string;
  @IsString() @MaxLength(500) notes: string;
  @ValidateIf((dto: CreateTransferDto) => dto.kind === 'cash')
  @IsIn(['ARS', 'USD'])
  currency?: 'ARS' | 'USD';
  @ValidateIf((dto: CreateTransferDto) => dto.kind === 'cash')
  @IsString()
  @MaxLength(40)
  amount?: string;
  @ValidateIf((dto: CreateTransferDto) => dto.kind === 'crypto')
  @IsString()
  @MaxLength(80)
  assetId?: string;
  @ValidateIf((dto: CreateTransferDto) => dto.kind === 'crypto')
  @IsString()
  @MaxLength(40)
  quantity?: string;
}
export function transferInput(dto: CreateTransferDto): TransferIntent {
  const base = {
    idempotencyKey: dto.idempotencyKey,
    source: dto.source,
    destination: dto.destination,
    fee: dto.fee,
    notes: dto.notes,
  };
  if (dto.kind === 'cash') {
    if (dto.assetId !== undefined || dto.quantity !== undefined)
      throw new BadRequestException(
        'Una transferencia de dinero no admite datos de activos.',
      );
    return {
      ...base,
      kind: 'cash',
      currency: dto.currency ?? 'ARS',
      amount: dto.amount ?? '',
    };
  }
  if (dto.currency !== undefined || dto.amount !== undefined)
    throw new BadRequestException(
      'Una transferencia de cripto no admite conversión de moneda.',
    );
  return {
    ...base,
    kind: 'crypto',
    assetId: dto.assetId ?? '',
    quantity: dto.quantity ?? '',
  };
}
