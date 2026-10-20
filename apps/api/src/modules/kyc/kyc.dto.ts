import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SubmitKycDto {
  @IsString() @MinLength(5) @MaxLength(120) fullName!: string;
  @IsIn(['ID_CARD', 'PASSPORT', 'DRIVING_LICENSE']) docType!: 'ID_CARD' | 'PASSPORT' | 'DRIVING_LICENSE';
  @IsString() @Matches(/^[A-Za-z0-9\-/ ]{4,32}$/, { message: 'رقم الوثيقة غير صالح' }) docNumber!: string;
}

export class ReviewKycDto {
  @IsIn(['APPROVED', 'REJECTED']) outcome!: 'APPROVED' | 'REJECTED';
  /** Required when rejecting: the user sees it so they can fix and resubmit. */
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ListKycQuery {
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED']) status?: 'PENDING' | 'APPROVED' | 'REJECTED';
}
