import { Body, Controller, Post } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateNicknameDto } from './dto/create-nickname.dto';
import type { PublicUser } from '@ml/shared';

@Controller('user')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Post('create-nickname')
  async createNickname(@Body() dto: CreateNicknameDto): Promise<PublicUser> {
    const updated = await this.users.setNickname(dto.telegramId, dto.nickname);
    return this.users.toPublic(updated);
  }
}
