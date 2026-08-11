import { Controller, Sse, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { EventsService } from './events.service';
import { SessionGuard } from '../auth/session.guard';

@Controller('events')
@UseGuards(SessionGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Sse('stream')
  @SkipThrottle()
  stream(): Observable<MessageEvent> {
    return this.events.getStream();
  }
}
