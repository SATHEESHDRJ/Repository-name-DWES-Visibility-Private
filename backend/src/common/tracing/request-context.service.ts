import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export interface RequestContext {
  requestId: string;
  userId?: number;
  role?: string;
  projectCode?: string;
  frameId?: string;
  cableIndex?: number;
  startTime: number;
}

@Injectable()
export class RequestContextService {
  private static readonly storage = new AsyncLocalStorage<RequestContext>();

  static run<T>(context: Partial<RequestContext>, callback: () => T): T {
    const fullContext: RequestContext = {
      requestId: context.requestId || randomUUID(),
      userId: context.userId,
      role: context.role,
      projectCode: context.projectCode,
      frameId: context.frameId,
      cableIndex: context.cableIndex,
      startTime: context.startTime || performance.now(),
    };
    return this.storage.run(fullContext, callback);
  }

  static getContext(): RequestContext | undefined {
    return this.storage.getStore();
  }

  static getRequestId(): string {
    return this.storage.getStore()?.requestId || 'no-request-id';
  }

  static setContextValue(key: keyof RequestContext, value: any): void {
    const store = this.storage.getStore();
    if (store) {
      (store as any)[key] = value;
    }
  }
}
