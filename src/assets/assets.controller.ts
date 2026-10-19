import { Controller, Get, HttpStatus } from '@nestjs/common';
import type { IResult } from '../common/interfaces/common.interface';
import { catalogAssets, type CatalogAsset } from './asset-catalog';

@Controller('assets')
export class AssetsController {
  @Get('catalog')
  catalog(): IResult<CatalogAsset[]> {
    return {
      result: catalogAssets(),
      message: 'Catálogo de activos',
      description:
        'La clasificación proviene del servidor. Los activos fuera del catálogo no son transferibles. La precisión es contable, no una garantía de compatibilidad con una red o plataforma.',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }
}
