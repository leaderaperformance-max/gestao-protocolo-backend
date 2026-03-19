import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateRequestTypeDto } from './dto/create-request-type.dto';
import { RequestTypesService } from './request-types.service';

interface AuthUser { id: string }

@ApiTags('request-types')
@ApiBearerAuth()
@Controller('request-types')
export class RequestTypesController {
  constructor(private readonly service: RequestTypesService) {}

  @Post()
  @RequirePermission('edit')
  @ApiOperation({ summary: 'Criar tipo de solicitação com SLA e fluxo' })
  create(@Body() dto: CreateRequestTypeDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar tipos de solicitação ativos' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar tipo de solicitação por ID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('edit')
  @ApiOperation({ summary: 'Atualizar tipo de solicitação' })
  update(@Param('id') id: string, @Body() dto: CreateRequestTypeDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('edit')
  @ApiOperation({ summary: 'Desativar tipo de solicitação' })
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }
}
