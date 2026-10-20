import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CustodyKeyService } from './custody-key.service';

@Module({
  // SecretsModule (EncryptionService) is @Global() — available here without importing it.
  imports: [DatabaseModule],
  providers: [CustodyKeyService],
  exports: [CustodyKeyService],
})
export class CustodyModule {}
