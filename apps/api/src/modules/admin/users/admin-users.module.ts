import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../database/database.module';
import { AdminUsersService } from './admin-users.service';
import { AdminUsersController } from './admin-users.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class AdminUsersModule {}
