import { Module } from '@nestjs/common';
import { GaDeviceLocationsModule } from '../ga-device-locations/ga-device-locations.module';
import { TbMarkersController } from './tb-markers.controller';
import { TbMarkersService } from './tb-markers.service';
import { TbMarkerMatchService } from './tb-marker-match.service';
import { ManualEndpointMappingService } from './manual-endpoint-mapping.service';

@Module({
  imports: [GaDeviceLocationsModule],
  controllers: [TbMarkersController],
  providers: [TbMarkersService, TbMarkerMatchService, ManualEndpointMappingService],
  exports: [TbMarkersService, TbMarkerMatchService, ManualEndpointMappingService],
})
export class TbMarkersModule {}

