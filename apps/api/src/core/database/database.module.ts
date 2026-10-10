import { Global, Module } from '@nestjs/common';
import { getDb } from './db';
import { DB_TOKEN, createScopedDbProxy } from '../../../../../packages/plugin-host/src';

export { DB_TOKEN } from '../../../../../packages/plugin-host/src/tokens';

@Global()
@Module({
  providers: [
    {
      provide: DB_TOKEN,
      useFactory: () => createScopedDbProxy(getDb()),
    },
  ],
  exports: [DB_TOKEN],
})
export class DatabaseModule {}
