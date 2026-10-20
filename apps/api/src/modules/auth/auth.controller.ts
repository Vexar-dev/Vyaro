import { Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/roles.decorator';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, LoginDto, RefreshDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto';

const REFRESH_COOKIE = 'vayro_refresh_token';
// The API is mounted at /api/v1 (see main.ts). A cookie scoped to '/auth' would NEVER be sent to
// /api/v1/auth/refresh, silently breaking refresh + logout.
const COOKIE_PATH = '/api/v1/auth';

function cookieOptions(maxAgeDays: number) {
  return {
    httpOnly: true,
    // COOKIE_SECURE=false مطلوب فقط عند التشغيل على http بدون HTTPS (تجارب محلية). في الإنتاج الحقيقي اتركه true/غير مضبوط.
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: COOKIE_PATH,
    maxAge: maxAgeDays * 24 * 60 * 60 * 1000,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 attempts / minute / IP — brute-force mitigation
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions(30));
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] ?? dto.refreshToken;
    if (!raw) throw new UnauthorizedException({ code: 'MISSING_REFRESH_TOKEN', message: 'لا توجد جلسة نشطة' });

    const result = await this.auth.refresh(raw, { userAgent: req.headers['user-agent'], ipAddress: req.ip });
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions(30));
    return { accessToken: result.accessToken };
  }

  @Public() // works even when the access token has already expired
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) await this.auth.logoutByRefreshToken(raw);
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
    return { loggedOut: true };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('password/forgot')
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    // Same response regardless of whether the account exists.
    return { message: 'إذا كان البريد الإلكتروني مسجلاً، سيصلك رابط إعادة تعيين كلمة المرور' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password/reset')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.newPassword);
    return { message: 'تم تحديث كلمة المرور بنجاح' };
  }
}
