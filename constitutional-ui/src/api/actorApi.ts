import { http } from "./http";

export type Actor = {
  actorId: string;
  name: string;
  authorityTier: number;
  domains: string[];
};

export async function getActorByUsername(username: string) {
  return http<Actor>(`/api/actors/by-username/${encodeURIComponent(username)}`);
}
