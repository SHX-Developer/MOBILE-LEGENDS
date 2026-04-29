import { IsString, Length, Matches } from 'class-validator';

export class CreateNicknameDto {
  @IsString()
  @Length(1, 64)
  telegramId!: string;

  @IsString()
  @Length(3, 24)
  @Matches(/^[A-Za-z0-9_]+$/, {
    message: 'nickname must contain only letters, numbers, or underscores',
  })
  nickname!: string;
}
