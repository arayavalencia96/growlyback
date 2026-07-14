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
import { GoalsService } from './goals.service';
import {
  CreateGoalDto,
  FindGoalsQueryDto,
  UpdateGoalDto,
} from './dto/goals.dto';
import { IGoalResponse } from './interfaces/goals.interface';
import { IResult } from '../common/interfaces/common.interface';

@ApiTags('goals')
@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Goal created successfully' })
  async create(
    @Body() createGoalDto: CreateGoalDto,
  ): Promise<IResult<IGoalResponse>> {
    const goal = await this.goalsService.create(createGoalDto);

    return {
      result: goal,
      message: 'Goal created successfully',
      description: 'The goal was stored in MongoDB Atlas',
      statuscode: HttpStatus.CREATED,
      ok: true,
    };
  }

  @Get()
  @ApiOkResponse({ description: 'Goals list retrieved successfully' })
  async findAll(
    @Query() query: FindGoalsQueryDto,
  ): Promise<IResult<Array<IGoalResponse>>> {
    const goals = await this.goalsService.findAll(query);

    return {
      result: goals,
      message: 'Goals retrieved successfully',
      description: 'Filtered by the provided query parameters',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Goal retrieved successfully' })
  async findOne(@Param('id') id: string): Promise<IResult<IGoalResponse>> {
    const goal = await this.goalsService.findOne(id);

    return {
      result: goal,
      message: 'Goal retrieved successfully',
      description: 'The goal was found by id',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Goal updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() updateGoalDto: UpdateGoalDto,
  ): Promise<IResult<IGoalResponse>> {
    const goal = await this.goalsService.update(id, updateGoalDto);

    return {
      result: goal,
      message: 'Goal updated successfully',
      description: 'The goal was updated in MongoDB Atlas',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Goal deleted successfully' })
  async remove(@Param('id') id: string): Promise<IResult<IGoalResponse>> {
    const goal = await this.goalsService.remove(id);

    return {
      result: goal,
      message: 'Goal deleted successfully',
      description: 'The goal was removed from MongoDB Atlas',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }
}
