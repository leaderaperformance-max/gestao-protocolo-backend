import { SetMetadata } from '@nestjs/common';
export const PERMISSION_KEY = 'permission';
export type Permission = 'view' | 'edit' | 'send' | 'receive' | 'approve' | 'reject';
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);
