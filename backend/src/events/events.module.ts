import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsInterceptor } from './events.interceptor';

@Global()
@Module({
  controllers: [EventsController],
  providers: [
    EventsService,
    { provide: APP_INTERCEPTOR, useClass: EventsInterceptor },
  ],
  exports: [EventsService],
})
export class EventsModule {}
