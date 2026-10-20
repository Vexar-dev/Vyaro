import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumberString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const URL_RE = /^(\/api\/v1\/media\/[a-f0-9-]{36}\.(png|jpg|webp)|https:\/\/[^\s]{3,500})$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export class UpsertCategoryDto {
  @IsString() @MaxLength(120) name!: string;
  @Matches(SLUG_RE, { message: 'slug غير صالح (a-z 0-9 -)' }) slug!: string;
  @IsOptional() @Matches(/^\d+$/) parentId?: string | null;
  @IsOptional() @Matches(URL_RE, { message: 'رابط الصورة غير صالح' }) imageUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) description?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class UpsertProductDto {
  @IsString() @MaxLength(191) name!: string;
  @Matches(/^\d+$/) categoryId!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @Matches(URL_RE, { message: 'رابط الصورة غير صالح' }) imageUrl?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @Matches(URL_RE, { each: true }) gallery?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(5) fields?: { key: string; label: string }[];
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

/** Edits the pricing inputs of ONE product's active supplier link. Send manualPrice:null to go back to cost+margin. */
export class SetPricingDto {
  @IsOptional() @IsIn(['PERCENT', 'FIXED']) marginType?: 'PERCENT' | 'FIXED' | null;
  @IsOptional() @Matches(/^\d{1,12}(\.\d{1,8})?$/) marginValue?: string | null;
  @IsOptional() @Matches(/^\d{1,15}(\.\d{1,8})?$/) manualPrice?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class BulkMarginDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @Matches(/^\d+$/, { each: true }) productIds!: string[];
  @IsIn(['PERCENT', 'FIXED']) marginType!: 'PERCENT' | 'FIXED';
  @Matches(/^\d{1,12}(\.\d{1,8})?$/) marginValue!: string;
  /** true (default): drop each product's manualPrice so the new margin actually takes effect. */
  @IsOptional() @IsBoolean() clearManualPrice?: boolean;
}

export class BulkActiveDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @Matches(/^\d+$/, { each: true }) productIds!: string[];
  @IsBoolean() isActive!: boolean;
}

export class BulkImageDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @Matches(/^\d+$/, { each: true }) productIds!: string[];
  @IsOptional() @Matches(URL_RE, { message: 'رابط الصورة غير صالح' }) imageUrl?: string | null;
}

export class ImportItemsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(64, { each: true }) skus!: string[];
  @Matches(/^\d+$/) categoryId!: string;
  @Matches(/^[A-Za-z0-9_]{2,16}$/) saleAssetCode!: string;
  @IsIn(['PERCENT', 'FIXED']) marginType!: 'PERCENT' | 'FIXED';
  @Matches(/^\d{1,12}(\.\d{1,8})?$/) marginValue!: string;
  /** One image applied to every imported product (each can be changed later). */
  @IsOptional() @Matches(URL_RE, { message: 'رابط الصورة غير صالح' }) imageUrl?: string | null;
  @IsOptional() @IsBoolean() activate?: boolean;
}

export class SetCredentialDto {
  @IsString() @MaxLength(200) apiKey!: string;
}

export class SetSupplierStatusDto {
  @IsIn(['ACTIVE', 'DISABLED']) status!: 'ACTIVE' | 'DISABLED';
}

export class SyncSupplierDto {
  @IsString() @Matches(/^[A-Za-z0-9_]{2,16}$/) saleAssetCode!: string;
}

export class ListAdminProductsQuery {
  @IsOptional() @IsNumberString() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsNumberString() page?: string;
}
