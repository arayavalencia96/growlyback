import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { SummariesModule } from '../summaries/summaries.module';
import { PortfolioLedgerModule } from '../portfolio-ledger.module';
import {
  GoalMovement,
  GoalMovementSchema,
} from '../goals-movements/entity/goals-movements.entity';
import {
  ContributionJob,
  ContributionJobSchema,
} from './contribution-job.entity';
import { ContributionJobService } from './contribution-job.service';
import {
  ContributionAdjustment,
  ContributionAdjustmentSchema,
} from './contribution-adjustment.entity';
import { ContributionAdjustmentService } from './contribution-adjustment.service';
import { Goal, GoalSchema } from '../goals/entity/goals.entity';
import { GoalsModule } from '../goals/goals.module';
import { ContributionPreviewController } from './contribution-preview.controller';
import { ContributionPreviewService } from './contribution-preview.service';
import {
  ContributionPreview,
  ContributionPreviewSchema,
} from './contribution-preview.entity';
import { AccountLinkController } from './account-link.controller';
import { AccountLinkService } from './account-link.service';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../common/auth/entity/auth.entity';
import {
  IntegrationLinkProjection,
  IntegrationLinkProjectionSchema,
  IntegrationLinkRevocation,
  IntegrationLinkRevocationSchema,
} from './integration-link.entity';

import { IntegrationConfig } from './integration.config';
import { IntegrationController } from './integration.controller';
import { IntegrationPeerGuard } from './integration-peer.guard';
import { IntegrationService } from './integration.service';

@Module({
  imports: [
    SummariesModule,
    ConfigModule,
    GoalsModule,
    PortfolioLedgerModule,
    MongooseModule.forFeature([
      {
        name: ContributionAdjustment.name,
        schema: ContributionAdjustmentSchema,
      },
      { name: Goal.name, schema: GoalSchema },
      { name: User.name, schema: UserSchema },
      { name: GoalMovement.name, schema: GoalMovementSchema },
      { name: ContributionJob.name, schema: ContributionJobSchema },
      { name: ContributionPreview.name, schema: ContributionPreviewSchema },
      {
        name: IntegrationLinkProjection.name,
        schema: IntegrationLinkProjectionSchema,
      },
      {
        name: IntegrationLinkRevocation.name,
        schema: IntegrationLinkRevocationSchema,
      },
    ]),
  ],
  controllers: [
    PortfolioController,
    IntegrationController,
    AccountLinkController,
    ContributionPreviewController,
  ],
  providers: [
    ContributionAdjustmentService,
    IntegrationConfig,
    IntegrationPeerGuard,
    IntegrationService,
    AccountLinkService,
    ContributionPreviewService,
    ContributionJobService,
  ],
  exports: [IntegrationService, AccountLinkService],
})
export class IntegrationModule {}
