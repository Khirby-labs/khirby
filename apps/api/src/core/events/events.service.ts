import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export interface CrmEvent {
  type: string;
  data: Record<string, unknown>;
}

@Injectable()
export class EventsService {
  private readonly subject = new Subject<CrmEvent>();

  emit(type: string, data: Record<string, unknown> = {}) {
    this.subject.next({ type, data });
  }

  getStream(): Observable<MessageEvent> {
    return new Observable((observer) => {
      const sub = this.subject.subscribe((event) => {
        observer.next({ data: JSON.stringify(event) } as MessageEvent);
      });
      return () => sub.unsubscribe();
    });
  }
}
