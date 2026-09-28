import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import "../setupEnv.js";
import app from "../../src/app.js";

/**
 * HTTP surface.
 *
 * A Gateway that is implemented but never mounted is an outage no unit test
 * would catch, and an AI endpoint reachable without a session is a privacy
 * incident. Both are asserted over real HTTP against an ephemeral port.
 */

let server: ReturnType<typeof app.listen>;
let origin: string;

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

describe("AI HTTP surface", () => {
  it("mounts the AI router and answers with an auth challenge, not 404", async () => {
    const response = await fetch(`${origin}/api/ai/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.notEqual(response.status, 404, "the AI router is not mounted");
    assert.equal(response.status, 401);
  });

  it("protects every AI endpoint with authentication", async () => {
    const calls: Array<[string, string]> = [
      ["POST", "/api/ai/snapshot"],
      ["POST", "/api/ai/insight"],
      ["POST", "/api/ai/feedback"],
      ["GET", "/api/ai/health"],
    ];

    for (const [method, path] of calls) {
      const response = await fetch(`${origin}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify({}),
      });

      assert.equal(response.status, 401, `${method} ${path} is reachable without a session`);
    }
  });

  it("does not expose a gateway route outside the AI prefix", async () => {
    const response = await fetch(`${origin}/ai/snapshot`, { method: "POST" });

    assert.equal(response.status, 404);
  });

  it("keeps the existing health check working alongside the AI routes", async () => {
    const response = await fetch(`${origin}/health`);

    assert.equal(response.status, 200);
  });
});
