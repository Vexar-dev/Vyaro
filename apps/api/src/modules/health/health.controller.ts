import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    let database = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }
    return { status: database === 'up' ? 'ok' : 'degraded', database };
  }
}
