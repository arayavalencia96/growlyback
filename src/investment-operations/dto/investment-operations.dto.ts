import { OmitType, PartialType } from '@nestjs/mapped-types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { GOAL_CURRENCIES } from '../../goals/interfaces/goals.interface';
import { INVESTMENT_OPERATION_TYPES } from '../interfaces/investment-operations.interface';

export class CreateInvestmentOperationDto {
  @ApiProperty() @IsMongoId() goalId: string;
  @ApiProperty({ example: 'IOL' }) @IsString() @MaxLength(120) platform: string;
  @ApiProperty({ example: 'AAPL' }) @IsString() @MaxLength(30) ticker: string;
  @ApiProperty({ enum: INVESTMENT_OPERATION_TYPES })
  @IsIn(INVESTMENT_OPERATION_TYPES)
  type: (typeof INVESTMENT_OPERATION_TYPES)[number];
  @ApiPropertyOptional() @IsOptional() @IsDateString() operationDate?: string;
  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  quantity: number;
  @ApiProperty({ example: 25.5 })
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  unitPrice: number;
  @ApiProperty({ example: 258.75 })
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  totalAmount: number;
  @ApiProperty({ enum: GOAL_CURRENCIES })
  @IsIn(GOAL_CURRENCIES)
  currency: (typeof GOAL_CURRENCIES)[number];
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  exchangeRateArsPerUsd?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?:
    string | null;
}

export class UpdateInvestmentOperationDto extends PartialType(
  OmitType(CreateInvestmentOperationDto, ['goalId'] as const),
) {}

export class FindInvestmentOperationsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() goalId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  platform?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  ticker?: string;
  @ApiPropertyOptional({ enum: INVESTMENT_OPERATION_TYPES })
  @IsOptional()
  @IsIn(INVESTMENT_OPERATION_TYPES)
  type?: (typeof INVESTMENT_OPERATION_TYPES)[number];
  @ApiPropertyOptional({ enum: GOAL_CURRENCIES })
  @IsOptional()
  @IsIn(GOAL_CURRENCIES)
  currency?: (typeof GOAL_CURRENCIES)[number];
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number;
}
