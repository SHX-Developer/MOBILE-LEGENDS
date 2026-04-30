import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { UserService } from '../user/user.service';
import type { TelegramAuthResponse } from '@ml/shared';

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserService,
    private readonly config: ConfigService,
  ) {}

  async authenticate(initData: string): Promise<TelegramAuthResponse> {
    const tgUser = this.verifyAndExtractUser(initData);
    const { user, isNew } = await this.users.findOrCreate(String(tgUser.id));
    return { user: this.users.toPublic(user), isNew };
  }

  private verifyAndExtractUser(initData: string): TelegramUser {
    const params = new URLSearchParams(initData);
    const userParam = params.get('user');
    if (!userParam) throw new BadRequestException('initData missing user');

    let parsed: TelegramUser;
    try {
      parsed = JSON.parse(userParam) as TelegramUser;
    } catch {
      throw new BadRequestException('initData user is not valid JSON');
    }
    if (!parsed?.id) throw new BadRequestException('initData user has no id');

    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (botToken) this.verifyHash(params, botToken);

    return parsed;
  }

  private verifyHash(params: URLSearchParams, botToken: string): void {
    const hash = params.get('hash');
    if (!hash) throw new BadRequestException('initData missing hash');

    const data: string[] = [];
    params.forEach((v, k) => {
      if (k !== 'hash' && k !== 'signature') data.push(`${k}=${v}`);
    });
    data.sort();
    const dataCheckString = data.join('\n');

    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (computed !== hash) {
      throw new BadRequestException('initData hash mismatch');
    }
  }
}
