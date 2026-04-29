import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('healthz')
  healthz(): { ok: true; uptime: number; ts: number } {
    return { ok: true, uptime: process.uptime(), ts: Date.now() };
  }
}
