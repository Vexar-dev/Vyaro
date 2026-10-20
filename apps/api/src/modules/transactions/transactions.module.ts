import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
