import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;
}

export class ChangeUsernameDto {
  @IsString()
  @MaxLength(20)
  newUsername!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
