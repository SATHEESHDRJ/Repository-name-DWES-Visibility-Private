import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GaFoundationModule } from '../ga-foundation/ga-foundation.module';
import { GaDeviceLocationsModule } from '../ga-device-locations/ga-device-locations.module';
import { DrawingTbAnalysisService } from './drawing-tb-analysis.service';
import { DrawingIntelligenceClient } from './drawing-intelligence.client';
import { AutomaticTbMarkerService } from './automatic-tb-marker.service';
import { CompletedLiveTbReportService } from './completed-live-tb-report.service';
import { DrawingTbAnalysisController } from './drawing-tb-analysis.controller';
import { DrawingIndexService } from './drawing-index.service';

@Module({
  imports: [PrismaModule, GaFoundationModule, GaDeviceLocationsModule],
  controllers: [DrawingTbAnalysisController],
  providers: [
    DrawingIntelligenceClient,
    AutomaticTbMarkerService,
    CompletedLiveTbReportService,
    DrawingTbAnalysisService,
    DrawingIndexService,
  ],
  exports: [
    DrawingTbAnalysisService,
    AutomaticTbMarkerService,
    CompletedLiveTbReportService,
    DrawingIndexService,
  ],
})
export class DrawingTbAnalysisModule {}
