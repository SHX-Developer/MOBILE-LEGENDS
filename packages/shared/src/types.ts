export interface TelegramAuthPayload {
  initData: string;
}

export interface TelegramAuthResponse {
  user: PublicUser;
  isNew: boolean;
}

export interface CreateNicknameRequest {
  telegramId: string;
  nickname: string;
}

export interface PublicUser {
  id: string;
  telegramId: string;
  nickname: string | null;
  createdAt: string;
}

export interface ApiError {
  statusCode: number;
  message: string;
}
