import { IsBoolean, IsIn, IsNumberString, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResolveDto {
  @IsIn(['SUCCEEDED', 'FAILED']) outcome!: 'SUCCEEDED' | 'FAILED';
  @IsOptional() @IsString() @MaxLength(128) providerOrderId?: string;
  /** Mandatory: who confirmed what with the provider. Goes to the audit log. */
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class SetRateDto {
  @Matches(/^[A-Za-z0-9_]{2,16}$/) fromAssetCode!: string;
  @Matches(/^[A-Za-z0-9_]{2,16}$/) toAssetCode!: string;
  @Matches(/^\d{1,12}(\.\d{1,8})?$/, { message: 'سعر الصرف غير صالح' }) rate!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SetSettingDto {
  @IsObject() value!: Record<string, unknown>;
}

export class StuckQuery {
  @IsOptional() @IsNumberString() minutes?: string;
}
