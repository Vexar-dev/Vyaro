import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const URL_RE = /^(\/api\/v1\/media\/[a-f0-9-]{36}\.(png|jpg|webp)|https:\/\/[^\s]{3,500})$/;

export class UpsertPostDto {
  @IsIn(['NEWS', 'OFFER']) kind!: 'NEWS' | 'OFFER';
  @IsIn(['DRAFT', 'PUBLISHED']) status!: 'DRAFT' | 'PUBLISHED';
  @IsString() @MinLength(2) @MaxLength(191) title!: string;
  @IsOptional() @IsString() @MaxLength(500) excerpt?: string | null;
  @IsString() @MinLength(1) @MaxLength(20000) body!: string;
  @IsOptional() @Matches(URL_RE, { message: 'رابط الصورة غير صالح' }) imageUrl?: string | null;
}
