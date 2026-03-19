import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { RequestsService } from './requests.service';

interface AuthUser { id: string; sectorId: string }

@ApiTags('requests')
@ApiBearerAuth()
@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  @RequirePermission('send')
  @ApiOperation({ summary: 'Protocolar nova solicitação' })
  create(@Body() dto: CreateRequestDto, @CurrentUser() user: AuthUser) {
    return this.requestsService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Listar protocolos com filtros e paginação' })
  findAll(@Query() query: ListRequestsDto) {
    return this.requestsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar protocolo completo por ID' })
  findOne(@Param('id') id: string) {
    return this.requestsService.findOne(id);
  }

  @Get(':id/timeline')
  @Public()
  @ApiOperation({ summary: 'Timeline pública do protocolo (sem autenticação)' })
  getTimeline(@Param('id') id: string) {
    return this.requestsService.getTimeline(id);
  }
}
