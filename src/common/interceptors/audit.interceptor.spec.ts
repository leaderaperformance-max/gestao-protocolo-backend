import { AuditInterceptor } from './audit.interceptor';
import { of } from 'rxjs';

describe('AuditInterceptor', () => {
  const makePrisma = () => ({
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  });

  it('should be defined', () => {
    const interceptor = new AuditInterceptor(makePrisma() as any);
    expect(interceptor).toBeDefined();
  });

  it('should extract entity type from URL', () => {
    const interceptor = new AuditInterceptor(makePrisma() as any) as any;
    expect(interceptor.extractEntityType('/requests/123')).toBe('requests');
    expect(interceptor.extractEntityType('/auth/login')).toBe('auth');
  });

  it('should skip non-write methods', (done) => {
    const prisma = makePrisma();
    const interceptor = new AuditInterceptor(prisma as any);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/requests', user: { id: 'u1' }, ip: '127.0.0.1', body: {} }),
      }),
    } as any;
    const next = { handle: () => of({ id: '1' }) } as any;
    interceptor.intercept(ctx, next).subscribe(() => {
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
      done();
    });
  });

  it('should skip unauthenticated requests', (done) => {
    const prisma = makePrisma();
    const interceptor = new AuditInterceptor(prisma as any);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', url: '/requests', user: undefined, ip: '127.0.0.1', body: {} }),
      }),
    } as any;
    const next = { handle: () => of({ id: '1' }) } as any;
    interceptor.intercept(ctx, next).subscribe(() => {
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
      done();
    });
  });
});
