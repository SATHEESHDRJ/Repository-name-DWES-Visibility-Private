import { Module } from '@nestjs/common';
import { RoutingService } from './routing.service';
import { EngineeringImportService } from './engineering-import.service';
import { OperationalTwinService } from './operational-twin.service';
import { OperationalTwin3dService } from './operational-twin-3d.service';
import { EngineeringController } from './engineering.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EngineeringController],
  providers: [RoutingService, EngineeringImportService, OperationalTwinService, OperationalTwin3dService],
  exports: [RoutingService, EngineeringImportService, OperationalTwinService, OperationalTwin3dService],
})
export class EngineeringModule {}
