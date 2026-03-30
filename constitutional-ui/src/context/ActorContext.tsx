import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export interface ActorState {
  actorId: string;
  actorName: string;
  authorityTier: number;
  domains: string[];
}

interface ActorContextValue {
  actor: ActorState | undefined;
  actorId: string | undefined;
  setActor: (next: ActorState | undefined) => void;
  isAdmin: boolean;
}

const ActorContext = createContext<ActorContextValue | undefined>(undefined);

export function ActorProvider({ children }: { children: ReactNode }) {
  const [actor, setActor] = useState<ActorState | undefined>();

  const value = useMemo<ActorContextValue>(
    () => ({
      actor,
      actorId: actor?.actorId,
      setActor,
      isAdmin: actor?.actorId === "principal.system"
    }),
    [actor]
  );

  return <ActorContext.Provider value={value}>{children}</ActorContext.Provider>;
}

export function useActor() {
  const context = useContext(ActorContext);
  if (!context) {
    throw new Error("useActor must be used within ActorProvider");
  }

  return context;
}
