import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Module({
  controllers: [StorageController],
  providers: [StorageService],
  // BoardPurgeService deletes a purged board's uploads through it.
  exports: [StorageService],
})
export class StorageModule {}
