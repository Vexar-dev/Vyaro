import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { normalizePhone } from '../../../common/phone/phone';

export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  username!: string;

  @IsEmail()
  email!: string;

  // MANDATORY and permanent (see users.phone trigger). Normalized to E.164 BEFORE validation so
  // "0933…", "963933…" and "+963933…" are the same number (otherwise the unique index is bypassable).
  @Transform(({ value }) => normalizePhone(value) ?? value)
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'رقم الهاتف غير صالح' })
  phone!: string;

  // Sham Cash account ADDRESS — mandatory and permanent, exactly like the phone (withdrawals only ever go here).
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[A-Za-z0-9_\-]{6,128}$/, { message: 'عنوان شام كاش غير صالح' })
  shamcashAddress!: string;

  // Enforced further by PasswordPolicy in AuthService (entropy, common-password check).
  @IsString()
  @MinLength(10, { message: 'كلمة المرور يجب أن تكون 10 أحرف على الأقل' })
  @MaxLength(128)
  password!: string;
}

export class LoginDto {
  @IsString()
  emailOrUsername!: string;

  @IsString()
  password!: string;
}

export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string; // normally read from the HttpOnly cookie; body fallback for non-browser clients
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  newPassword!: string;
}
