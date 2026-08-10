import { Module } from '@nestjs/common';
import { DirectorController } from './director.controller';
import { DirectorService } from './director.service';

@Module({
  controllers: [DirectorController],
  providers: [DirectorService],
})
export class DirectorModule {}
