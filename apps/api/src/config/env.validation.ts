import { plainToInstance } from 'class-transformer';
import { IsIn, IsNumberString, IsOptional, IsString, Matches, MinLength, validateSync } from 'class-validator';

class EnvVars {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV!: string;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @Matches(/^[0-9a-fA-F]{64}$/, { message: 'ENCRYPTION_KEY must be 64 hex chars (openssl rand -hex 32)' })
  ENCRYPTION_KEY!: string;

  @IsNumberString()
  REFRESH_TOKEN_TTL_DAYS!: string;

  // Optional: only required once you actually create Tatum subscriptions
  // (DepositMonitoringService throws a clear error at call time if missing —
  // not required at boot, so installs not yet using deposit monitoring are
  // unaffected).
  @IsOptional()
  @IsString()
  PUBLIC_API_BASE_URL?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  AUTO_ACTIVATE_USERS?: string;

  @IsOptional()
  @IsString()
  TRUST_PROXY?: string;
}

/** Fails fast at boot if any required secret/config is missing or too weak. */
export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvVars, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n${errors.toString()}`);
  }
  return validated;
}
