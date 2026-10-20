import { IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateStoreOrderDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number;

  /** Product-specific purchase params (e.g. target game id/phone) — passed through to the provider. */
  @IsOptional()
  @IsObject()
  purchaseMetadata?: Record<string, unknown>;
}
