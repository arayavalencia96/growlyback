import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsIn,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  GOAL_CURRENCIES,
  GOAL_STATUSES,
  GOAL_TRACKING_MODES,
  GOAL_TYPES,
} from '../interfaces/goals.interface';

export class OpeningCashBalanceDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) platform: string;
  @ApiProperty({ enum: GOAL_CURRENCIES })
  @IsIn(GOAL_CURRENCIES)
  currency: (typeof GOAL_CURRENCIES)[number];
  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  amount: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  exchangeRateArsPerUsd?: number | null;
}

export class OpeningPositionDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) platform: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(30) ticker: string;
  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  quantity: number;
  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  unitPrice: number;
  @ApiProperty()
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
}

export class CreateGoalDto {
  @ApiProperty({
    description: 'Goal name',
    example: 'Car',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({
    description: 'Goal type',
    enum: GOAL_TYPES,
    example: 'long_term',
  })
  @IsIn(GOAL_TYPES)
  type: (typeof GOAL_TYPES)[number];

  @ApiProperty({
    description: 'Target amount for the goal',
    example: 15000000,
  })
  @IsInt()
  @Min(1)
  targetAmount: number;

  @ApiProperty({
    description: 'Goal currency',
    enum: GOAL_CURRENCIES,
    example: 'USD',
  })
  @IsIn(GOAL_CURRENCIES)
  currency: (typeof GOAL_CURRENCIES)[number];

  @ApiPropertyOptional({
    description: 'Goal start date',
    example: '2026-07-14T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Goal end date',
    example: '2027-07-14T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional({
    description: 'Goal status',
    enum: GOAL_STATUSES,
    example: 'active',
  })
  @IsOptional()
  @IsIn(GOAL_STATUSES)
  status?: (typeof GOAL_STATUSES)[number];

  @ApiPropertyOptional({
    description: 'Additional notes',
    example: 'Buy in tranches if market is volatile',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @ApiProperty({ enum: GOAL_TRACKING_MODES })
  @IsIn(GOAL_TRACKING_MODES)
  trackingMode: (typeof GOAL_TRACKING_MODES)[number];

  @ApiPropertyOptional({ type: [OpeningCashBalanceDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OpeningCashBalanceDto)
  openingCashBalances?: OpeningCashBalanceDto[];

  @ApiPropertyOptional({ type: [OpeningPositionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OpeningPositionDto)
  openingPositions?: OpeningPositionDto[];
}

export class UpdateGoalDto extends PartialType(
  OmitType(CreateGoalDto, [
    'trackingMode',
    'openingCashBalances',
    'openingPositions',
    'startDate',
  ] as const),
) {}

export class FindGoalsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by type',
    enum: GOAL_TYPES,
  })
  @IsOptional()
  @IsIn(GOAL_TYPES)
  type?: (typeof GOAL_TYPES)[number];

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: GOAL_STATUSES,
  })
  @IsOptional()
  @IsIn(GOAL_STATUSES)
  status?: (typeof GOAL_STATUSES)[number];

  @ApiPropertyOptional({
    description: 'Filter by currency',
    enum: GOAL_CURRENCIES,
  })
  @IsOptional()
  @IsIn(GOAL_CURRENCIES)
  currency?: (typeof GOAL_CURRENCIES)[number];

  @ApiPropertyOptional({
    description: 'Search by goal name or notes',
    example: 'car',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Records to skip',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number;
}
