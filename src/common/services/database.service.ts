import { Injectable, NotFoundException } from '@nestjs/common';
import { HydratedDocument, Model, ProjectionType, UpdateQuery } from 'mongoose';

type DatabaseFilter = Record<string, unknown>;

export interface IDatabaseListOptions<TDocument> {
  limit?: number;
  skip?: number;
  sort?: Record<string, 1 | -1>;
  select?: ProjectionType<TDocument>;
}

export interface IDatabaseUpdateOptions {
  upsert?: boolean;
}

@Injectable()
export class DatabaseService {
  async create<TDocument>(
    model: Model<TDocument>,
    payload: Partial<TDocument>,
  ): Promise<HydratedDocument<TDocument>> {
    return model.create(payload);
  }

  async findAll<TDocument>(
    model: Model<TDocument>,
    filter: DatabaseFilter = {},
    options: IDatabaseListOptions<TDocument> = {},
  ): Promise<Array<HydratedDocument<TDocument>>> {
    const query = model.find(filter as never);

    if (options.select) {
      query.select(options.select);
    }

    if (options.sort) {
      query.sort(options.sort);
    }

    if (typeof options.skip === 'number') {
      query.skip(options.skip);
    }

    if (typeof options.limit === 'number') {
      query.limit(options.limit);
    }

    return query.exec();
  }

  async findOne<TDocument>(
    model: Model<TDocument>,
    filter: DatabaseFilter,
    options: Pick<IDatabaseListOptions<TDocument>, 'select' | 'sort'> = {},
  ): Promise<HydratedDocument<TDocument> | null> {
    const query = model.findOne(filter as never);

    if (options.select) {
      query.select(options.select);
    }

    if (options.sort) {
      query.sort(options.sort);
    }

    return query.exec();
  }

  async findById<TDocument>(
    model: Model<TDocument>,
    id: string,
    select?: ProjectionType<TDocument>,
  ): Promise<HydratedDocument<TDocument> | null> {
    const query = model.findById(id);

    if (select) {
      query.select(select);
    }

    return query.exec();
  }

  async findByIdOrFail<TDocument>(
    model: Model<TDocument>,
    id: string,
    select?: ProjectionType<TDocument>,
  ): Promise<HydratedDocument<TDocument>> {
    const document = await this.findById(model, id, select);

    if (!document) {
      throw new NotFoundException(`Document with id ${id} was not found`);
    }

    return document;
  }

  async findOneOrFail<TDocument>(
    model: Model<TDocument>,
    filter: DatabaseFilter,
  ): Promise<HydratedDocument<TDocument>> {
    const document = await this.findOne(model, filter);

    if (!document) {
      throw new NotFoundException('Document was not found');
    }

    return document;
  }

  async updateById<TDocument>(
    model: Model<TDocument>,
    id: string,
    payload: UpdateQuery<TDocument>,
    options: IDatabaseUpdateOptions = {},
  ): Promise<HydratedDocument<TDocument> | null> {
    return model
      .findByIdAndUpdate(id, payload, {
        returnDocument: 'after',
        upsert: options.upsert ?? false,
        runValidators: true,
      })
      .exec();
  }

  async updateByIdOrFail<TDocument>(
    model: Model<TDocument>,
    id: string,
    payload: UpdateQuery<TDocument>,
    options: IDatabaseUpdateOptions = {},
  ): Promise<HydratedDocument<TDocument>> {
    const document = await this.updateById(model, id, payload, options);

    if (!document) {
      throw new NotFoundException(`Document with id ${id} was not found`);
    }

    return document;
  }

  async updateOneOrFail<TDocument>(
    model: Model<TDocument>,
    filter: DatabaseFilter,
    payload: UpdateQuery<TDocument>,
  ): Promise<HydratedDocument<TDocument>> {
    const document = await model
      .findOneAndUpdate(filter as never, payload, {
        returnDocument: 'after',
        runValidators: true,
      })
      .exec();

    if (!document) {
      throw new NotFoundException('Document was not found');
    }

    return document;
  }

  async deleteById<TDocument>(
    model: Model<TDocument>,
    id: string,
  ): Promise<HydratedDocument<TDocument> | null> {
    return model.findByIdAndDelete(id).exec();
  }

  async deleteByIdOrFail<TDocument>(
    model: Model<TDocument>,
    id: string,
  ): Promise<HydratedDocument<TDocument>> {
    const document = await this.deleteById(model, id);

    if (!document) {
      throw new NotFoundException(`Document with id ${id} was not found`);
    }

    return document;
  }

  async deleteOneOrFail<TDocument>(
    model: Model<TDocument>,
    filter: DatabaseFilter,
  ): Promise<HydratedDocument<TDocument>> {
    const document = await model.findOneAndDelete(filter as never).exec();

    if (!document) {
      throw new NotFoundException('Document was not found');
    }

    return document;
  }
}
