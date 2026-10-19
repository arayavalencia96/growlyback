import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class ContributionConfirmDto {
  @IsUUID('4') previewId: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  valuationExchangeRateArsPerUsd?: number;
}
