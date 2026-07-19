import { OmitType, PartialType } from '@nestjs/mapped-types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { GOAL_CURRENCIES } from '../../goals/interfaces/goals.interface';
import { GOAL_MOVEMENT_TYPES } from '../interfaces/goals-movements.interface';

export class CreateGoalMovementDto {
  @ApiProperty() @IsMongoId() goalId: string;
  @ApiProperty({ enum: GOAL_MOVEMENT_TYPES })
  @IsIn(GOAL_MOVEMENT_TYPES)
  type: (typeof GOAL_MOVEMENT_TYPES)[number];
  @ApiProperty({ example: 1000.5 })
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  amount: number;
  @ApiProperty({ enum: GOAL_CURRENCIES })
  @IsIn(GOAL_CURRENCIES)
  currency: (typeof GOAL_CURRENCIES)[number];
  @ApiPropertyOptional() @IsOptional() @IsDateString() movementDate?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  exchangeRateArsPerUsd?: number | null;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) platform: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?:
    string | null;
}

export class UpdateGoalMovementDto extends PartialType(
  OmitType(CreateGoalMovementDto, ['goalId'] as const),
) {}

export class FindGoalMovementsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() goalId?: string;
  @ApiPropertyOptional({ enum: GOAL_MOVEMENT_TYPES })
  @IsOptional()
  @IsIn(GOAL_MOVEMENT_TYPES)
  type?: (typeof GOAL_MOVEMENT_TYPES)[number];
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
