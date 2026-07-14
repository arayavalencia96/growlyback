import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class GoalSummaryParamsDto {
  @ApiProperty()
  @IsMongoId()
  goalId: string;
}
