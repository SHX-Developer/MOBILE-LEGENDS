import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TelegramAuthDto } from './dto/telegram-auth.dto';
import type { TelegramAuthResponse } from '@ml/shared';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('telegram')
  authenticate(@Body() dto: TelegramAuthDto): Promise<TelegramAuthResponse> {
    return this.auth.authenticate(dto.initData);
  }
}
