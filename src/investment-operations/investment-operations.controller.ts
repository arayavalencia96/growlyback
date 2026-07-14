import { Controller } from '@nestjs/common';
import { InvestmentOperationsService } from './investment-operations.service';

@Controller('investment-operations')
export class InvestmentOperationsController {
  constructor(private readonly investmentOperationsService: InvestmentOperationsService) {}
}
