import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService.create', () => {
  it('should hash the password before saving and not return passwordHash', async () => {
    const prismaMock = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'uuid-1',
          name: 'Test User',
          email: 'test@semed.pa.gov.br',
          registrationNumber: '12345',
          passwordHash: 'hashed_value',
          isActive: true,
          role: { id: 'r1', name: 'Admin', slug: 'admin', permissions: {}, isSuperadmin: true },
          sector: { id: 's1', name: 'Protocolo', code: 'PROT', isActive: true },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    } as any;

    const service = new UsersService(prismaMock);
    const result = await service.create({
      name: 'Test User',
      email: 'test@semed.pa.gov.br',
      password: 'senha12345',
      registrationNumber: '12345',
      sectorId: 'uuid-sector',
      roleId: 'uuid-role',
    });

    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordHash: expect.any(String) }),
      }),
    );
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('should throw ConflictException when email already exists', async () => {
    const prismaMock = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing' }),
      },
    } as any;
    const service = new UsersService(prismaMock);
    await expect(
      service.create({
        name: 'Dup',
        email: 'dup@test.com',
        password: 'senha12345',
        registrationNumber: '99999',
        sectorId: 's1',
        roleId: 'r1',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
