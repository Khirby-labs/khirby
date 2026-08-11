import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    // Minimal body — no timestamps/version. External access blocked in nginx;
    // Docker healthchecks hit 127.0.0.1 (see docker/nginx.conf, Dockerfile).
    return { status: 'ok' };
  }
}
