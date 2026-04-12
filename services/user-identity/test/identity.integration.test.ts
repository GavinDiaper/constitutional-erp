import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";
import { db } from "../src/db/connection";
import { loadConfig } from "../src/config/env";

const app = createApp();
const config = loadConfig();

beforeEach(() => {
  db.exec("DELETE FROM refresh_token;");
  db.exec("DELETE FROM identity_user;");
});

describe("user-identity integration", () => {
  it("returns providers", async () => {
    const response = await request(app).get("/auth/providers");
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body.providers));
    assert.equal(response.body.providers.length, 3);
  });

  it("supports mock callback and me flow", async () => {
    const callback = await request(app)
      .get("/auth/callback/google")
      .query({ email: "test.user@example.com", sub: "google-sub-1" });

    assert.equal(callback.status, 200);
    assert.equal(typeof callback.body.accessToken, "string");
    assert.equal(typeof callback.body.refreshToken, "string");

    const me = await request(app)
      .get("/identity/me")
      .set("authorization", `Bearer ${callback.body.accessToken}`);

    assert.equal(me.status, 200);
    assert.equal(me.body.email, "test.user@example.com");
    assert.equal(me.body.status, "limited");
  });

  it("refreshes and revokes refresh tokens", async () => {
    const callback = await request(app)
      .get("/auth/callback/google")
      .query({ email: "refresh.user@example.com", sub: "google-sub-2" });

    const refreshed = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: callback.body.refreshToken });

    assert.equal(refreshed.status, 200);
    assert.equal(typeof refreshed.body.accessToken, "string");

    const reuse = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: callback.body.refreshToken });

    assert.equal(reuse.status, 401);
  });

  it("links identity to h2r with admin secret", async () => {
    const callback = await request(app)
      .get("/auth/callback/microsoft")
      .query({ email: "linked.user@example.com", sub: "ms-sub-1" });

    const linked = await request(app)
      .post("/identity/link-h2r")
      .set("x-admin-secret", config.adminSecret)
      .send({ identityId: callback.body.identity.identityId, h2rEmployeeId: "emp-100" });

    assert.equal(linked.status, 200);
    assert.equal(linked.body.status, "active");
    assert.equal(linked.body.h2rEmployeeId, "emp-100");
  });
});
