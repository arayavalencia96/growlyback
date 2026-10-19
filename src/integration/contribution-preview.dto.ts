import {
  IsDateString,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  GOAL_CURRENCIES,
  type GoalCurrency,
} from '../goals/interfaces/goals.interface';

export class ContributionPreviewDto {
  @IsMongoId() goalId: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @IsIn(GOAL_CURRENCIES) currency: GoalCurrency;
  @IsDateString({ strict: true }) movementDate: string;
  @IsString() @IsNotEmpty() @MaxLength(120) platform: string;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  exchangeRateArsPerUsd?: number;
}
