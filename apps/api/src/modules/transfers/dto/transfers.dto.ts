import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTransferDto {
  /** Recipient's @username — never their internal numeric id (IDOR-safe by construction). */
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  toUsername!: string;

  /** e.g. "USDT" — validated against the assets table (isActive) in the service, not here. */
  @IsString()
  @Matches(/^[A-Za-z0-9_]{2,16}$/, { message: 'رمز العملة غير صالح' })
  assetCode!: string;

  /** Decimal string, e.g. "100.50" — parsed via Money.fromDecimalString against the asset's decimals. */
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'صيغة المبلغ غير صالحة' })
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  note?: string;
}
