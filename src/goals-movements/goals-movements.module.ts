import { Module } from '@nestjs/common';
import { GoalsMovementsService } from './goals-movements.service';
import { GoalsMovementsController } from './goals-movements.controller';

@Module({
  controllers: [GoalsMovementsController],
  providers: [GoalsMovementsService],
})
export class GoalsMovementsModule {}
