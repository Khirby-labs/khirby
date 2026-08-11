import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AppException } from './app-exception';

@Injectable()
export class SessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!request.session?.userId) {
      throw AppException.sessionExpired();
    }
    return true;
  }
}
