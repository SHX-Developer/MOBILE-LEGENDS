import { IsString, MinLength } from 'class-validator';

export class TelegramAuthDto {
  @IsString()
  @MinLength(1)
  initData!: string;
}
