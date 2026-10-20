import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * The destination (any Sham Cash account address, or any Syriatel Cash number) is supplied by the user at send
 * time and validated per provider in the service. Verified identity (KYC) is required before this endpoint works.
 * `pin` and any other unknown field are still rejected (forbidNonWhitelisted).
 */
export class CreateWithdrawalDto {
  @IsIn(['shamcash', 'syriatel'])
  providerCode!: 'shamcash' | 'syriatel';

  @IsString()
  @Matches(/^[A-Za-z0-9_]{2,16}$/, { message: 'رمز العملة غير صالح' })
  assetCode!: string;

  @IsString()
  @Matches(/^\d{1,15}(\.\d{1,8})?$/, { message: 'صيغة المبلغ غير صالحة' })
  amount!: string;

  /** Sham Cash: account address. Syriatel Cash: the 09xxxxxxxx number. */
  @IsString()
  @MaxLength(128)
  destination!: string;

  /** Syriatel only. Default: transfer_cash. */
  @IsOptional()
  @IsIn(['transfer_cash', 'mobile_recharge'])
  action?: 'transfer_cash' | 'mobile_recharge';
}
