import { IsIn, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['PENDING', 'ACTIVE', 'FROZEN', 'BANNED'])
  status?: 'PENDING' | 'ACTIVE' | 'FROZEN' | 'BANNED';

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}

export class SetUserStatusDto {
  @IsIn(['ACTIVE', 'FROZEN', 'BANNED'])
  status!: 'ACTIVE' | 'FROZEN' | 'BANNED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AssignRoleDto {
  /** USER is the implicit default role — never assigned/revoked through this endpoint. */
  @IsIn(['SUPPORT', 'ADMIN', 'SUPER_ADMIN', 'STORE_ADMIN'])
  roleCode!: 'SUPPORT' | 'ADMIN' | 'SUPER_ADMIN' | 'STORE_ADMIN';
}
