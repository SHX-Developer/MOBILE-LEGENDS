import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import type { PublicUser } from '@ml/shared';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  async findByTelegramId(telegramId: string): Promise<User | null> {
    return this.repo.findOne({ where: { telegramId } });
  }

  async findOrCreate(telegramId: string): Promise<{ user: User; isNew: boolean }> {
    const existing = await this.findByTelegramId(telegramId);
    if (existing) return { user: existing, isNew: false };
    const user = this.repo.create({ telegramId, nickname: null });
    await this.repo.save(user);
    return { user, isNew: true };
  }

  async setNickname(telegramId: string, nickname: string): Promise<User> {
    const user = await this.findByTelegramId(telegramId);
    if (!user) throw new NotFoundException('User not found');

    const dupe = await this.repo.findOne({ where: { nickname } });
    if (dupe && dupe.id !== user.id) {
      throw new ConflictException('Nickname already taken');
    }

    user.nickname = nickname;
    return this.repo.save(user);
  }

  toPublic(user: User): PublicUser {
    return {
      id: user.id,
      telegramId: user.telegramId,
      nickname: user.nickname,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
