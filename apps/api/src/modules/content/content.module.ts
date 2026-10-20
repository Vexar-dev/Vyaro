import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';

@Module({ imports: [DatabaseModule], controllers: [ContentController], providers: [ContentService], exports: [ContentService] })
export class ContentModule {}
