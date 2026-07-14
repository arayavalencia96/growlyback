import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { IResult } from '../common/interfaces/common.interface';
import {
  CreateInvestmentOperationDto,
  FindInvestmentOperationsQueryDto,
  UpdateInvestmentOperationDto,
} from './dto/investment-operations.dto';
import { InvestmentOperationsService } from './investment-operations.service';
import { IInvestmentOperationResponse } from './interfaces/investment-operations.interface';

@ApiTags('investment operations')
@Controller('investment-operations')
export class InvestmentOperationsController {
  constructor(
    private readonly investmentOperationsService: InvestmentOperationsService,
  ) {}

  @Post()
  @ApiCreatedResponse({
    description: 'Investment operation created successfully',
  })
  async create(
    @Body() dto: CreateInvestmentOperationDto,
  ): Promise<IResult<IInvestmentOperationResponse>> {
    return {
      result: await this.investmentOperationsService.create(dto),
      message: 'Investment operation created successfully',
      description: 'The operation was assigned to the goal',
      statuscode: HttpStatus.CREATED,
      ok: true,
    };
  }

  @Get()
  @ApiOkResponse({
    description: 'Investment operations retrieved successfully',
  })
  async findAll(
    @Query() query: FindInvestmentOperationsQueryDto,
  ): Promise<IResult<IInvestmentOperationResponse[]>> {
    return {
      result: await this.investmentOperationsService.findAll(query),
      message: 'Investment operations retrieved successfully',
      description: 'Filtered by the provided query parameters',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Investment operation retrieved successfully' })
  async findOne(
    @Param('id') id: string,
  ): Promise<IResult<IInvestmentOperationResponse>> {
    return {
      result: await this.investmentOperationsService.findOne(id),
      message: 'Investment operation retrieved successfully',
      description: 'The operation was found by id',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Investment operation updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInvestmentOperationDto,
  ): Promise<IResult<IInvestmentOperationResponse>> {
    return {
      result: await this.investmentOperationsService.update(id, dto),
      message: 'Investment operation updated successfully',
      description: 'The operation and its calculated totals were updated',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Investment operation deleted successfully' })
  async remove(
    @Param('id') id: string,
  ): Promise<IResult<IInvestmentOperationResponse>> {
    return {
      result: await this.investmentOperationsService.remove(id),
      message: 'Investment operation deleted successfully',
      description: 'The operation was removed from MongoDB Atlas',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }
}
