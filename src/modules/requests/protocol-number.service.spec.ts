import { ProtocolNumberService } from './protocol-number.service';

describe('ProtocolNumberService', () => {
  const makePrismaMock = (lastSequence: number, sectorCode: string) => ({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: any) => Promise<any>) =>
      fn({
        protocolSequence: {
          upsert: jest.fn().mockResolvedValue({
            year: new Date().getFullYear(),
            sectorCode,
            lastSequence,
          }),
        },
      }),
    ),
  });

  it('should generate protocol number in correct format', async () => {
    const service = new ProtocolNumberService(makePrismaMock(123, 'RH') as any);
    const result = await service.generate('RH');
    expect(result).toBe(`${new Date().getFullYear()}-RH-000123`);
  });

  it('should pad sequence to 6 digits', async () => {
    const service = new ProtocolNumberService(makePrismaMock(1, 'PROT') as any);
    const result = await service.generate('PROT');
    expect(result).toBe(`${new Date().getFullYear()}-PROT-000001`);
  });

  it('should produce correct format for large sequence numbers', async () => {
    const service = new ProtocolNumberService(makePrismaMock(999999, 'GAB') as any);
    const result = await service.generate('GAB');
    expect(result).toBe(`${new Date().getFullYear()}-GAB-999999`);
  });
});
