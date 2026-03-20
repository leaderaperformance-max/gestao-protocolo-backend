import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { RequestsService } from './requests.service';

interface AuthUser { id: string; sectorId: string }

@ApiTags('Protocolos')
@ApiBearerAuth()
@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  @RequirePermission('send')
  @ApiOperation({ summary: 'Protocolar nova solicitação' })
  @ApiResponse({ status: 201, description: 'Protocolo criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou regra de negócio violada' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Sem permissão para esta ação' })
  create(@Body() dto: CreateRequestDto, @CurrentUser() user: AuthUser) {
    return this.requestsService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Listar protocolos com filtros e paginação' })
  @ApiResponse({ status: 200, description: 'Lista de protocolos retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  findAll(@Query() query: ListRequestsDto) {
    return this.requestsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar protocolo completo por ID' })
  @ApiResponse({ status: 200, description: 'Protocolo retornado com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'Protocolo não encontrado' })
  findOne(@Param('id') id: string) {
    return this.requestsService.findOne(id);
  }

  @Get(':id/timeline')
  @Public()
  @ApiOperation({ summary: 'Timeline pública do protocolo (sem autenticação)' })
  @ApiResponse({ status: 200, description: 'Timeline retornada com sucesso' })
  @ApiResponse({ status: 404, description: 'Protocolo não encontrado' })
  getTimeline(@Param('id') id: string) {
    return this.requestsService.getTimeline(id);
  }
}
