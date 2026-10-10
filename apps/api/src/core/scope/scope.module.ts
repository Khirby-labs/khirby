import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScopeInterceptor } from './scope.interceptor';

/**
 * Registers ScopeInterceptor globally. Without a SCOPE_PROVIDER from a plugin
 * the interceptor is a no-op (Community).
 */
@Global()
@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: ScopeInterceptor }],
})
export class ScopeModule {}
