import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommonModule } from '../common/common.module';
import { GoalsService } from './goals.service';
import { GoalsController } from './goals.controller';
import { Goal, GoalSchema } from './entity/goals.entity';

@Module({
  imports: [
    CommonModule,
    MongooseModule.forFeature([
      {
        name: Goal.name,
        schema: GoalSchema,
      },
    ]),
  ],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
