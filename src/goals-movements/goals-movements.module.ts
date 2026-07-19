import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommonModule } from '../common/common.module';
import { GoalsModule } from '../goals/goals.module';
import { PortfolioLedgerModule } from '../portfolio-ledger.module';
import {
  GoalMovement,
  GoalMovementSchema,
} from './entity/goals-movements.entity';
import { GoalsMovementsService } from './goals-movements.service';
import { GoalsMovementsController } from './goals-movements.controller';

@Module({
  imports: [
    CommonModule,
    GoalsModule,
    PortfolioLedgerModule,
    MongooseModule.forFeature([
      { name: GoalMovement.name, schema: GoalMovementSchema },
    ]),
  ],
  controllers: [GoalsMovementsController],
  providers: [GoalsMovementsService],
  exports: [GoalsMovementsService],
})
export class GoalsMovementsModule {}
