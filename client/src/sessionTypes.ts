/** Данные пользователя из GET /api/v1/me (sessions#show) */
export type SessionUser = {
  id: number;
  login: string;
  full_name: string;
  role?: string | null;
  position_label?: string | null;
};

export type AuthOutletContext = { user: SessionUser };
