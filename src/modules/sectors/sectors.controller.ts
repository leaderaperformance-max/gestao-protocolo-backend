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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SectorsService } from './sectors.service';
import { CreateSectorDto } from './dto/create-sector.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Setores')
@ApiBearerAuth()
@Controller('sectors')
export class SectorsController {
  constructor(private readonly sectorsService: SectorsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos os setores ativos' })
  @ApiResponse({ status: 200, description: 'Lista de setores retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  findAll() {
    return this.sectorsService.findAll();
  }

  @Post()
  @RequirePermission('edit')
  @ApiOperation({ summary: 'Criar novo setor' })
  @ApiResponse({ status: 201, description: 'Setor criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou regra de negócio violada' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Sem permissão para esta ação' })
  create(@Body() dto: CreateSectorDto) {
    return this.sectorsService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar setor por ID' })
  @ApiResponse({ status: 200, description: 'Setor retornado com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'Setor não encontrado' })
  findOne(@Param('id') id: string) {
    return this.sectorsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('edit')
  @ApiOperation({ summary: 'Atualizar setor' })
  @ApiResponse({ status: 200, description: 'Setor atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou regra de negócio violada' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Sem permissão para esta ação' })
  @ApiResponse({ status: 404, description: 'Setor não encontrado' })
  update(@Param('id') id: string, @Body() dto: CreateSectorDto) {
    return this.sectorsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('edit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Desativar setor (soft delete)' })
  @ApiResponse({ status: 200, description: 'Setor desativado com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Sem permissão para esta ação' })
  @ApiResponse({ status: 404, description: 'Setor não encontrado' })
  remove(@Param('id') id: string) {
    return this.sectorsService.remove(id);
  }
}
