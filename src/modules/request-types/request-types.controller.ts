import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateRequestTypeDto } from './dto/create-request-type.dto';
import { RequestTypesService } from './request-types.service';

interface AuthUser { id: string }

@ApiTags('Tipos de Solicitação')
@ApiBearerAuth()
@Controller('request-types')
export class RequestTypesController {
  constructor(private readonly service: RequestTypesService) {}

  @Post()
  @RequirePermission('edit')
  @ApiOperation({ summary: 'Criar tipo de solicitação com SLA e fluxo' })
  @ApiResponse({ status: 201, description: 'Tipo de solicitação criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou regra de negócio violada' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Sem permissão para esta ação' })
  create(@Body() dto: CreateRequestTypeDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar tipos de solicitação ativos' })
  @ApiResponse({ status: 200, description: 'Lista de tipos de solicitação retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar tipo de solicitação por ID' })
  @ApiResponse({ status: 200, description: 'Tipo de solicitação retornado com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'Tipo de solicitação não encontrado' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('edit')
  @ApiOperation({ summary: 'Atualizar tipo de solicitação' })
  @ApiResponse({ status: 200, description: 'Tipo de solicitação atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou regra de negócio violada' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Sem permissão para esta ação' })
  @ApiResponse({ status: 404, description: 'Tipo de solicitação não encontrado' })
  update(@Param('id') id: string, @Body() dto: CreateRequestTypeDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('edit')
  @ApiOperation({ summary: 'Desativar tipo de solicitação' })
  @ApiResponse({ status: 200, description: 'Tipo de solicitação desativado com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Sem permissão para esta ação' })
  @ApiResponse({ status: 404, description: 'Tipo de solicitação não encontrado' })
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }
}
