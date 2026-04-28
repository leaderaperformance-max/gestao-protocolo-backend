import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { TramitationsService } from './tramitations.service';

const makeRequest = (overrides = {}) => ({
  id: 'req-1',
  status: RequestStatus.EM_ANALISE,
  requesterId: 'user-requester',
  protocolNumber: '2026-PROT-000001',
  currentSectorId: 'sec-rh',
  currentSector: { id: 'sec-rh', code: 'RH', name: 'RH' },
  requestType: { flow: ['PROT', 'RH', 'JUR', 'GAB'] },
  ...overrides,
});

const makeUser = (overrides = {}) => ({
  id: 'user-1',
  sectorId: 'sec-rh',
  role: { isSuperadmin: false },
  ...overrides,
});

describe('TramitationsService', () => {
  describe('changeStatus', () => {
    it('should throw when INDEFERIDO without justification', async () => {
      const prismaMock = {
        request: { findUnique: jest.fn().mockResolvedValue(makeRequest()) },
      } as any;
      const notifMock = { create: jest.fn() } as any;
      const auditMock = { log: jest.fn() } as any;
      const service = new TramitationsService(prismaMock, notifMock, auditMock);

      await expect(
        service.changeStatus('req-1', { status: RequestStatus.INDEFERIDO, justification: '' }, makeUser()),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when PENDENTE_DOCUMENTO without justification', async () => {
      const prismaMock = {
        request: { findUnique: jest.fn().mockResolvedValue(makeRequest()) },
      } as any;
      const notifMock = { create: jest.fn() } as any;
      const auditMock = { log: jest.fn() } as any;
      const service = new TramitationsService(prismaMock, notifMock, auditMock);

      await expect(
        service.changeStatus('req-1', { status: RequestStatus.PENDENTE_DOCUMENTO }, makeUser()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('forward', () => {
    it('should throw ForbiddenException when user is not in current sector', async () => {
      const prismaMock = {
        request: { findUnique: jest.fn().mockResolvedValue(makeRequest()) },
      } as any;
      const notifMock = { create: jest.fn() } as any;
      const auditMock = { log: jest.fn() } as any;
      const service = new TramitationsService(prismaMock, notifMock, auditMock);
      const user = makeUser({ sectorId: 'sec-prot' }); // wrong sector

      await expect(
        service.forward('req-1', { toSectorCode: 'JUR' }, user),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when forwarding out of flow order', async () => {
      const prismaMock = {
        request: { findUnique: jest.fn().mockResolvedValue(makeRequest()) },
        sector: { findUnique: jest.fn().mockResolvedValue({ id: 'sec-gab', code: 'GAB', name: 'GAB' }) },
      } as any;
      const notifMock = { create: jest.fn() } as any;
      const auditMock = { log: jest.fn() } as any;
      const service = new TramitationsService(prismaMock, notifMock, auditMock);

      await expect(
        service.forward('req-1', { toSectorCode: 'GAB' }, makeUser()),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
