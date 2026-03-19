import { PermissionGuard } from './permission.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';

const mockContext = (user: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as any;

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionGuard(reflector);
  });

  it('should allow when no permission required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(mockContext({}))).toBe(true);
  });

  it('should allow superadmin regardless of permissions', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('approve');
    const user = { role: { isSuperadmin: true, permissions: {} } };
    expect(guard.canActivate(mockContext(user))).toBe(true);
  });

  it('should deny user without required permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('approve');
    const user = { role: { isSuperadmin: false, permissions: { approve: false } } };
    expect(() => guard.canActivate(mockContext(user))).toThrow(ForbiddenException);
  });

  it('should allow user with required permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('receive');
    const user = { role: { isSuperadmin: false, permissions: { receive: true } } };
    expect(guard.canActivate(mockContext(user))).toBe(true);
  });

  it('should throw ForbiddenException when user is undefined', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('view');
    expect(() => guard.canActivate(mockContext(undefined))).toThrow(ForbiddenException);
  });
});
