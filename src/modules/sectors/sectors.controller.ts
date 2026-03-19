import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SectorsService } from './sectors.service';
import { CreateSectorDto } from './dto/create-sector.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('sectors')
@ApiBearerAuth()
@Controller('sectors')
export class SectorsController {
  constructor(private readonly sectorsService: SectorsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos os setores ativos' })
  findAll() {
    return this.sectorsService.findAll();
  }

  @Post()
  @RequirePermission('edit')
  @ApiOperation({ summary: 'Criar novo setor' })
  create(@Body() dto: CreateSectorDto) {
    return this.sectorsService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar setor por ID' })
  findOne(@Param('id') id: string) {
    return this.sectorsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('edit')
  @ApiOperation({ summary: 'Atualizar setor' })
  update(@Param('id') id: string, @Body() dto: CreateSectorDto) {
    return this.sectorsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('edit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Desativar setor (soft delete)' })
  remove(@Param('id') id: string) {
    return this.sectorsService.remove(id);
  }
}
