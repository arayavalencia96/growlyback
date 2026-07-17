import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/mapped-types';
import {
  IsDateString,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  GOAL_CURRENCIES,
  GOAL_STATUSES,
  GOAL_TYPES,
} from '../interfaces/goals.interface';

export class CreateGoalDto {
  @ApiProperty({
    description: 'Goal name',
    example: 'Car',
  })
  @IsString()
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
}

export class UpdateGoalDto extends PartialType(CreateGoalDto) {}

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
