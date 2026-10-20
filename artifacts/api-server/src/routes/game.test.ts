import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import mongoose from "mongoose";
import app from "../app";

test("anonymous game sessions stay private across cookies, survive refresh, and reject a fourth decision", async () => {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}/api/game`;

    const started = await fetch(baseUrl, { method: "POST" });
    assert.equal(started.status, 201, "starting an anonymous game must not require login");
    const setCookie = started.headers.get("set-cookie");
    assert.ok(setCookie, "the anonymous session cookie should be returned");
    const cookie = setCookie.match(/(?:^|,\s*)sahmi_session=([^;,]+)/)?.[1];
    assert.ok(cookie, "the response should contain the game session cookie");
    const sessionHeader = `sahmi_session=${cookie}`;

    const secondStarted = await fetch(baseUrl, { method: "POST" });
    assert.equal(secondStarted.status, 201);
    const secondSetCookie = secondStarted.headers.get("set-cookie");
    assert.ok(secondSetCookie, "the second anonymous game should have its own cookie");
    const secondCookie = secondSetCookie.match(/(?:^|,\s*)sahmi_session=([^;,]+)/)?.[1];
    assert.ok(secondCookie, "the second response should contain a game session cookie");
    const secondSessionHeader = `sahmi_session=${secondCookie}`;
    assert.notEqual(sessionHeader, secondSessionHeader, "independent games should receive distinct cookies");

    const submitWithCookie = async (cookieHeader: string, body: Record<string, unknown>) => {
      const response = await fetch(`${baseUrl}/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookieHeader },
        body: JSON.stringify(body),
      });
      return { response, body: await response.json() as Record<string, any> };
    };
    const submit = (body: Record<string, unknown>) => submitWithCookie(sessionHeader, body);

    const first = await submit({
      decision: 1, version: 0,
      amounts: { stockFund: 1000, bondFund: 0, gold: 0, cash: 0 },
    });
    assert.equal(first.response.status, 200);

    const second = await submit({ decision: 2, version: 1, action: "hold" });
    assert.equal(second.response.status, 200);

    const third = await submit({
      decision: 3, version: 2,
      amounts: { stockFund: 300, bondFund: 0, gold: 0, cash: 0 },
    });
    assert.equal(third.response.status, 200);
    const completed = third.body;

    assert.equal(completed.decisions.length, 3);
    assert.equal(completed.nextDecision, 4);
    assert.equal(completed.expensePaidKd, 300);
    assert.equal(completed.decisions[2].decision, 3);
    assert.ok(completed.decisions[2].explanation, "the expense decision should remain in public history");
    assert.ok(completed.finalOutcome, "the completed game should include its badge and score");
    assert.ok(completed.finalOutcome.badgeTitle);
    assert.equal(typeof completed.finalOutcome.score, "number");
    assert.equal(completed.monthlyPlayback.length, 13);
    assert.equal(completed.monthlyPlayback.at(-1).totalKd, completed.totalKd);

    // A browser refresh is a new read, using only the same anonymous cookie.
    const refreshedResponse = await fetch(baseUrl, {
      headers: { cookie: sessionHeader },
    });
    assert.equal(refreshedResponse.status, 200);
    const refreshed = await refreshedResponse.json();
    assert.deepEqual(refreshed, completed);

    const secondDecision = await submitWithCookie(secondSessionHeader, {
      decision: 1, version: 0,
      amounts: { stockFund: 0, bondFund: 0, gold: 0, cash: 1000 },
    });
    assert.equal(secondDecision.response.status, 200);
    assert.notDeepEqual(secondDecision.body, completed, "the two games should have distinct saved states");

    const secondGameRead = await fetch(baseUrl, {
      headers: { cookie: secondSessionHeader },
    });
    assert.equal(secondGameRead.status, 200);
    assert.deepEqual(await secondGameRead.json(), secondDecision.body);

    const firstGameRead = await fetch(baseUrl, {
      headers: { cookie: sessionHeader },
    });
    assert.equal(firstGameRead.status, 200);
    assert.deepEqual(await firstGameRead.json(), completed);

    const missingCookieRead = await fetch(baseUrl);
    assert.equal(missingCookieRead.status, 404, "a request without a session cookie must not read either game");

    const unrelatedCookieRead = await fetch(baseUrl, {
      headers: { cookie: `sahmi_session=${"a".repeat(64)}` },
    });
    assert.equal(unrelatedCookieRead.status, 404, "an unrelated cookie must not read either game");

    const fourth = await submit({ decision: 4, version: 3, action: "hold" });
    assert.equal(fourth.response.status, 400);
    assert.equal(fourth.body.nextDecision, undefined);

    const afterRejectedFourth = await fetch(baseUrl, {
      headers: { cookie: sessionHeader },
    });
    assert.equal(afterRejectedFourth.status, 200);
    assert.deepEqual(await afterRejectedFourth.json(), completed);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
    await mongoose.disconnect();
  }
});
