import { Readable } from "node:stream";

export function portalApi(fixture, verifyLogins = false) {
  async function request(path, body, account, headers = {}) {
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
      const code = fixture.sent.filter(mail => mail.email === body.email && mail.subject === "Код для входа — Node Studio").at(-1).content.match(/\b\d{6}\b/)[0];
      return request("auth/verify", { code }, response);
    }
    return response;
  }
  async function login(role, password, current) {
    const result = await request(current ? "profiles/add" : "login", { email: fixture.users[role].email, password, role: ["developer", "admin"].includes(role) ? role : "client" }, current);
    if (result.body.kind !== "verification") return result;
    const code = fixture.sent.filter(mail => mail.email === fixture.users[role].email && mail.subject === "Код для входа — Node Studio").at(-1).content.match(/\b\d{6}\b/)[0];
    return request("auth/verify", { code }, result);
  }
  return { request, login };
}
