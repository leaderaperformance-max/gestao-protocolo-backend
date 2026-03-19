import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, Permission } from '../decorators/require-permission.decorator';

interface UserWithRole {
  role?: {
    isSuperadmin: boolean;
    permissions: Record<string, boolean>;
  };
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<Permission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) return true;

    const request = context.switchToHttp().getRequest<{ user?: UserWithRole }>();
    const { user } = request;

    if (!user) throw new ForbiddenException('Sem autenticação');
    if (user.role?.isSuperadmin) return true;

    const permissions = user.role?.permissions;
    if (!permissions?.[requiredPermission]) {
      throw new ForbiddenException(
        `Permissão insuficiente: requer '${requiredPermission}'`,
      );
    }

    return true;
  }
}
