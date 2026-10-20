import { IsString, Matches } from 'class-validator';

export class ConvertDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_]{2,16}$/)
  fromAssetCode!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_]{2,16}$/)
  toAssetCode!: string;

  @IsString()
  @Matches(/^\d{1,15}(\.\d{1,8})?$/, { message: 'صيغة المبلغ غير صالحة' })
  amount!: string;
}
