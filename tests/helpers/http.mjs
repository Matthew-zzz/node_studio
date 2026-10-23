import { Readable } from "node:stream";

/** Codes are read only from the isolated mail adapter, never from the public API. */
export async function emailCode(fixture, email) {
  const challenge = fixture.store.db.prepare("SELECT id,code_hash FROM auth_challenges WHERE email=? ORDER BY created_at DESC,rowid DESC LIMIT 1").get(email);
  if (!challenge) throw new Error("Fixture email challenge missing");
  for (let attempt = 0; attempt < 300; attempt++) {
    await fixture.service.workJobs();
    const mail = fixture.sent.find(mail => mail.email === email && mail.subject === "Код для входа — Node Studio" && mail.deliveryId === `code:${challenge.id}:${challenge.code_hash}`);
    if (mail) return mail.content.match(/\b\d{6}\b/)[0];
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Fixture code delivery timed out");
}

export function portalApi(fixture, verifyLogins = false) {
  async function request(path, body, account, headers = {}) {
    if (["login", "profiles/add"].includes(path) && body && !body.role) body = { ...body, role: Object.values(fixture.users).find(user => user.email === body.email)?.role ?? "client" };
    const input = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    input.url = `/api/portal/${path}`; input.method = body === undefined ? "GET" : "POST";
    input.socket = { remoteAddress: "127.0.0.1" };
    input.headers = { origin: fixture.config.origin, "content-type": "application/json", ...(account ? { cookie: account.cookie, "x-csrf-token": account.body.csrf ?? "" } : {}), ...headers };
    const response = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
    await fixture.handler(input, response);
    const values = [response.headers["Set-Cookie"] ?? []].flat();
    const cookies = new Map((account?.cookie ?? "").split(";").filter(Boolean).map(part => part.trim().split("=")));
    for (const value of values) { const [key, token] = value.split(";")[0].split("="); if (value.includes("Max-Age=0")) cookies.delete(key); else cookies.set(key, token); }
    response.cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
    if (verifyLogins && ["login", "profiles/add"].includes(path) && response.body.kind === "verification") {
      const code = await emailCode(fixture, body.email);
      return request("auth/verify", { code }, response);
    }
    return response;
  }
  async function login(role, password, current) {
    const result = await request(current ? "profiles/add" : "login", { email: fixture.users[role].email, password, role: ["developer", "admin"].includes(role) ? role : "client" }, current);
    if (result.body.kind !== "verification") return result;
    const code = await emailCode(fixture, fixture.users[role].email);
    return request("auth/verify", { code }, result);
  }
  return { request, login };
}
