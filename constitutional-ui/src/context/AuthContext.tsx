import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { login as loginApi, logout as logoutApi } from "../api/authApi";
import { getActorByUsername } from "../api/actorApi";
import { useActor } from "./ActorContext";

interface AuthContextValue {
  isAuthenticated: boolean;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("canvas_token"));
  const { setActor } = useActor();

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: Boolean(token),
      token,
      login: async (username: string, password: string) => {
        const session = await loginApi({ username, password });
        localStorage.setItem("canvas_token", session.token);
        setToken(session.token);
        const actor = await getActorByUsername(username);
        setActor({
          actorId: actor.actorId,
          actorName: actor.name,
          authorityTier: actor.authorityTier,
          domains: actor.domains
        });
      },
      logout: async () => {
        await logoutApi();
        localStorage.removeItem("canvas_token");
        setToken(null);
        setActor(undefined);
      }
    }),
    [setActor, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
