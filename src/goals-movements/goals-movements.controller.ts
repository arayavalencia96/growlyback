import { Controller } from '@nestjs/common';
import { GoalsMovementsService } from './goals-movements.service';

@Controller('goals-movements')
export class GoalsMovementsController {
  constructor(private readonly goalsMovementsService: GoalsMovementsService) {}
}
