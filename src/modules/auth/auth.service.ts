import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit-logs/audit.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import type { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async login(dto: LoginDto, res: Response, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true, sector: true },
    });

    if (!user || !user.isActive) {
      this.auditService.log({
        actorUserId: 'anonymous',
        action: 'LOGIN_FAILURE',
        entityType: 'auth',
        entityId: dto.email,
        payloadAfter: { reason: !user ? 'user_not_found' : 'user_inactive' },
        ipAddress: ip,
        userAgent,
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      this.auditService.log({
        actorUserId: user.id,
        action: 'LOGIN_FAILURE',
        entityType: 'auth',
        entityId: user.id,
        payloadAfter: { reason: 'invalid_password' },
        ipAddress: ip,
        userAgent,
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const tokens = await this.generateTokens(user.id, user.email);

    await this.prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const isProduction = this.config.get<string>('nodeEnv') === 'production';
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    this.auditService.log({
      actorUserId: user.id,
      action: 'LOGIN_SUCCESS',
      entityType: 'auth',
      entityId: user.id,
      ipAddress: ip,
      userAgent,
    });

    const { passwordHash: _ph, ...userWithoutPassword } = user;
    return { accessToken: tokens.accessToken, user: userWithoutPassword };
  }

  async refresh(refreshToken: string | undefined, res: Response, ip?: string, userAgent?: string) {
    if (!refreshToken) throw new BadRequestException('Refresh token não fornecido');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    try {
      const refreshSecret = this.config.get<string>('jwt.refreshSecret');
      const payload = this.jwtService.verify<{ sub: string; email: string }>(refreshToken, {
        secret: refreshSecret,
      });

      const tokens = await this.generateTokens(payload.sub, payload.email);

      await this.prisma.refreshToken.update({
        where: { token: refreshToken },
        data: { revokedAt: new Date() },
      });

      await this.prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: payload.sub,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const isProduction = this.config.get<string>('nodeEnv') === 'production';
      res.cookie('refresh_token', tokens.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      this.auditService.log({
        actorUserId: payload.sub,
        action: 'TOKEN_REFRESH',
        entityType: 'auth',
        entityId: payload.sub,
        ipAddress: ip,
        userAgent,
      });

      return { accessToken: tokens.accessToken };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  async logout(refreshToken: string | undefined, res: Response, userId: string, ip?: string, userAgent?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken
        .update({
          where: { token: refreshToken },
          data: { revokedAt: new Date() },
        })
        .catch(() => {});
    }
    res.clearCookie('refresh_token');

    this.auditService.log({
      actorUserId: userId,
      action: 'LOGOUT',
      entityType: 'auth',
      entityId: userId,
      ipAddress: ip,
      userAgent,
    });

    return { message: 'Logout realizado com sucesso' };
  }

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    const accessSecret = this.config.get<string>('jwt.accessSecret');
    const refreshSecret = this.config.get<string>('jwt.refreshSecret');
    const accessExpiresIn = this.config.get<string>('jwt.accessExpiresIn') ?? '8h';
    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn') ?? '7d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { secret: accessSecret, expiresIn: accessExpiresIn } as JwtSignOptions),
      this.jwtService.signAsync(payload, { secret: refreshSecret, expiresIn: refreshExpiresIn } as JwtSignOptions),
    ]);
    return { accessToken, refreshToken };
  }
}
