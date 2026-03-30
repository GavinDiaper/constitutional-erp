import { Router } from "express";
import { HttpError } from "../utils/errors";

type ActorRecord = {
  actorId: string;
  name: string;
  authorityTier: number;
  domains: string[];
};

type UserRecord = {
  username: string;
  password: string;
  actor: ActorRecord;
};

const users: UserRecord[] = [
  {
    username: "gavin",
    password: "secret123",
    actor: {
      actorId: "principal.system",
      name: "Constitutional System Principal",
      authorityTier: 5,
      domains: ["p2p", "o2c", "r2r", "h2r"]
    }
  }
];

function toToken(user: UserRecord): string {
  const payload = {
    sub: user.username,
    actorId: user.actor.actorId,
    authorityTier: user.actor.authorityTier,
    domains: user.actor.domains,
    isAdmin: user.actor.actorId === "principal.system",
    iat: Math.floor(Date.now() / 1000)
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function actorFromAuthHeader(authorizationHeader: string | undefined): ActorRecord {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new HttpError(401, "invalid_token", "Authorization header is missing or malformed.");
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  let decoded: {
    actorId?: string;
  };

  try {
    decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as { actorId?: string };
  } catch {
    throw new HttpError(401, "invalid_token", "Token could not be parsed.");
  }

  if (!decoded.actorId) {
    throw new HttpError(401, "invalid_token", "Token payload is missing actorId.");
  }

  const actor = users.find((candidate) => candidate.actor.actorId === decoded.actorId)?.actor;
  if (!actor) {
    throw new HttpError(401, "invalid_token", "Token actor is not recognized.");
  }

  return actor;
}

export const authRouter = Router();

authRouter.post("/auth/login", (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  const user = users.find((candidate) => candidate.username === username);
  if (!user || user.password !== password) {
    throw new HttpError(401, "invalid_credentials", "Username or password is incorrect.");
  }

  res.json({
    token: toToken(user),
    user: {
      id: user.actor.actorId,
      username: user.username,
      roles: user.actor.actorId === "principal.system" ? ["admin"] : ["user"]
    }
  });
});

authRouter.post("/auth/logout", (_req, res) => {
  res.json({ ok: true });
});

authRouter.get("/auth/me", (req, res) => {
  const actor = actorFromAuthHeader(req.header("authorization"));

  res.json({
    user: {
      id: actor.actorId,
      username: users.find((candidate) => candidate.actor.actorId === actor.actorId)?.username ?? actor.actorId,
      roles: actor.actorId === "principal.system" ? ["admin"] : ["user"]
    },
    actor: {
      actorId: actor.actorId,
      name: actor.name,
      authorityTier: actor.authorityTier,
      domains: actor.domains,
      isAdmin: actor.actorId === "principal.system"
    }
  });
});

authRouter.get("/api/actors/by-username/:username", (req, res) => {
  const username = String(req.params.username ?? "").trim();
  const user = users.find((candidate) => candidate.username === username);

  if (!user) {
    throw new HttpError(404, "actor_not_found", "No actor is associated with this username.");
  }

  res.json(user.actor);
});
