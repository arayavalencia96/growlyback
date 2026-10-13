import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class ContributionAdjustmentDto {
  @IsUUID('4') id: string;
  @IsInt() @Min(1) expectedRevision: number;
  @IsIn(['edit', 'void']) kind: 'edit' | 'void';
  @ValidateIf((value: ContributionAdjustmentDto) => value.kind === 'edit')
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 8 })
  @IsPositive()
  exchangeRateArsPerUsd?: number;
  @IsString() @MaxLength(500) reason: string;
}
