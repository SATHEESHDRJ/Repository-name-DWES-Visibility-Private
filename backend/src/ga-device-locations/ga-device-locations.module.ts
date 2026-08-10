import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GaDeviceLocationsRepository } from './ga-device-locations.repository';
import { GaDeviceLocationsService } from './ga-device-locations.service';
import { AutomaticGaDeviceLocationService } from './automatic-ga-device-location.service';

/**
 * 2D GA DEVICE locations (ga_device_locations).
 * Distinct from 3D CAD device_geometries / terminal_geometries.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    GaDeviceLocationsRepository,
    GaDeviceLocationsService,
    AutomaticGaDeviceLocationService,
  ],
  exports: [
    GaDeviceLocationsService,
    AutomaticGaDeviceLocationService,
    GaDeviceLocationsRepository,
  ],
})
export class GaDeviceLocationsModule {}
