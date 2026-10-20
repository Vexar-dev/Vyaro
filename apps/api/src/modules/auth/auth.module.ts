import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { JwtStrategy } from './jwt.strategy';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, TokensService, JwtStrategy],
  exports: [TokensService],
})
export class AuthModule {}
