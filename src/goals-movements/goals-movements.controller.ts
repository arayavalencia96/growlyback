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
  CreateGoalMovementDto,
  FindGoalMovementsQueryDto,
  UpdateGoalMovementDto,
} from './dto/goals-movements.dto';
import { GoalsMovementsService } from './goals-movements.service';
import { IGoalMovementResponse } from './interfaces/goals-movements.interface';

@ApiTags('goal movements')
@Controller('goals-movements')
export class GoalsMovementsController {
  constructor(private readonly goalsMovementsService: GoalsMovementsService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Goal movement created successfully' })
  async create(
    @Body() dto: CreateGoalMovementDto,
  ): Promise<IResult<IGoalMovementResponse>> {
    return {
      result: await this.goalsMovementsService.create(dto),
      message: 'Goal movement created successfully',
      description: 'The cash movement was assigned to the goal',
      statuscode: HttpStatus.CREATED,
      ok: true,
    };
  }

  @Get()
  @ApiOkResponse({ description: 'Goal movements retrieved successfully' })
  async findAll(
    @Query() query: FindGoalMovementsQueryDto,
  ): Promise<IResult<IGoalMovementResponse[]>> {
    return {
      result: await this.goalsMovementsService.findAll(query),
      message: 'Goal movements retrieved successfully',
      description: 'Filtered by the provided query parameters',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Goal movement retrieved successfully' })
  async findOne(
    @Param('id') id: string,
  ): Promise<IResult<IGoalMovementResponse>> {
    return {
      result: await this.goalsMovementsService.findOne(id),
      message: 'Goal movement retrieved successfully',
      description: 'The movement was found by id',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Goal movement updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateGoalMovementDto,
  ): Promise<IResult<IGoalMovementResponse>> {
    return {
      result: await this.goalsMovementsService.update(id, dto),
      message: 'Goal movement updated successfully',
      description: 'The movement was updated in MongoDB Atlas',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Goal movement deleted successfully' })
  async remove(
    @Param('id') id: string,
  ): Promise<IResult<IGoalMovementResponse>> {
    return {
      result: await this.goalsMovementsService.remove(id),
      message: 'Goal movement deleted successfully',
      description: 'The movement was removed from MongoDB Atlas',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }
}
