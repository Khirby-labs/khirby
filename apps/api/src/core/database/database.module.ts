import { Global, Module } from '@nestjs/common';
import { getDb } from './db';
import { DB_TOKEN } from '../../../../../packages/plugin-host/src/tokens';

export { DB_TOKEN } from '../../../../../packages/plugin-host/src/tokens';

@Global()
@Module({
  providers: [
    {
      provide: DB_TOKEN,
      useFactory: () => getDb(),
    },
  ],
  exports: [DB_TOKEN],
})
export class DatabaseModule {}
