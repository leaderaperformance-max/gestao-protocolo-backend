import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ChangeStatusDto } from './dto/change-status.dto';
import { ForwardDto } from './dto/forward.dto';
import { TramitationsService } from './tramitations.service';

interface AuthUser {
  id: string;
  sectorId: string;
  role: { isSuperadmin: boolean };
}

@ApiTags('Tramitação')
@ApiBearerAuth()
@Controller('requests/:id')
export class TramitationsController {
  constructor(private readonly tramitationsService: TramitationsService) {}

  @Post('forward')
  @RequirePermission('send')
  @ApiOperation({ summary: 'Encaminhar protocolo para o próximo setor' })
  @ApiResponse({ status: 201, description: 'Protocolo encaminhado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou regra de negócio violada' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Sem permissão para esta ação' })
  @ApiResponse({ status: 404, description: 'Protocolo não encontrado' })
  forward(
    @Param('id') id: string,
    @Body() dto: ForwardDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tramitationsService.forward(id, dto, user);
  }

  @Post('receive')
  @RequirePermission('receive')
  @ApiOperation({ summary: 'Confirmar recebimento do protocolo no setor atual' })
  @ApiResponse({ status: 201, description: 'Recebimento confirmado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou regra de negócio violada' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Sem permissão para esta ação' })
  @ApiResponse({ status: 404, description: 'Protocolo não encontrado' })
  receive(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tramitationsService.receive(id, user);
  }

  @Patch('status')
  @RequirePermission('edit')
  @ApiOperation({ summary: 'Alterar status do protocolo' })
  @ApiResponse({ status: 200, description: 'Status alterado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou regra de negócio violada' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Sem permissão para esta ação' })
  @ApiResponse({ status: 404, description: 'Protocolo não encontrado' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tramitationsService.changeStatus(id, dto, user);
  }
}
