import { AuditInterceptor } from './audit.interceptor';
import { of } from 'rxjs';

describe('AuditInterceptor', () => {
  const makePrisma = () => ({
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  });

  const makeAuditService = () => ({
    log: jest.fn(),
  });

  it('should be defined', () => {
    const interceptor = new AuditInterceptor(makePrisma() as any, makeAuditService() as any);
    expect(interceptor).toBeDefined();
  });

  it('should extract entity type from URL', () => {
    const interceptor = new AuditInterceptor(makePrisma() as any, makeAuditService() as any) as any;
    expect(interceptor.extractEntityType('/requests/123')).toBe('requests');
    expect(interceptor.extractEntityType('/auth/login')).toBe('auth');
  });

  it('should extract entity ID (UUID) from URL', () => {
    const interceptor = new AuditInterceptor(makePrisma() as any, makeAuditService() as any) as any;
    expect(interceptor.extractEntityId('/requests/550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(interceptor.extractEntityId('/requests')).toBe('');
  });

  it('should skip non-write methods', (done) => {
    const auditService = makeAuditService();
    const interceptor = new AuditInterceptor(makePrisma() as any, auditService as any);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/requests', user: { id: 'u1' }, ip: '127.0.0.1', body: {}, headers: {} }),
      }),
    } as any;
    const next = { handle: () => of({ id: '1' }) } as any;
    interceptor.intercept(ctx, next).subscribe(() => {
      expect(auditService.log).not.toHaveBeenCalled();
      done();
    });
  });

  it('should skip unauthenticated requests', (done) => {
    const auditService = makeAuditService();
    const interceptor = new AuditInterceptor(makePrisma() as any, auditService as any);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', url: '/requests', user: undefined, ip: '127.0.0.1', body: {}, headers: {} }),
      }),
    } as any;
    const next = { handle: () => of({ id: '1' }) } as any;
    interceptor.intercept(ctx, next).subscribe(() => {
      expect(auditService.log).not.toHaveBeenCalled();
      done();
    });
  });

  it('should call auditService.log for write methods with authenticated user', (done) => {
    const auditService = makeAuditService();
    const interceptor = new AuditInterceptor(makePrisma() as any, auditService as any);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          url: '/requests',
          user: { id: 'u1' },
          ip: '127.0.0.1',
          body: { title: 'test' },
          headers: { 'user-agent': 'TestAgent/1.0' },
        }),
      }),
    } as any;
    const next = { handle: () => of({ id: 'new-id' }) } as any;
    interceptor.intercept(ctx, next).subscribe(() => {
      // auditService.log is called asynchronously via beforePromise.then
      // Give it a tick to resolve
      setTimeout(() => {
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            actorUserId: 'u1',
            action: 'POST:/requests',
            entityType: 'requests',
            entityId: 'new-id',
            ipAddress: '127.0.0.1',
            userAgent: 'TestAgent/1.0',
          }),
        );
        done();
      }, 10);
    });
  });
});
