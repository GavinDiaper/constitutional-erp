import { http } from "./http";

export type LoginRequest = {
  username: string;
  password: string;
};

export type AuthUser = {
  id: string;
  username: string;
  roles: string[];
};

export async function login(payload: LoginRequest) {
  return http<{ token: string; user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function me() {
  return http<{ user: AuthUser }>("/auth/me");
}

export async function logout() {
  return http<{ ok: boolean }>("/auth/logout", { method: "POST" });
}
