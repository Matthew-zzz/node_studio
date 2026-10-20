export interface PortalConfig {
  origin: string;
  database: string;
  port: number;
  host: string;
  staticDirectory: string;
  stateDirectory: string;
  bootstrapEmployees: boolean;
  trustProxy: boolean;
  revision: string;
  secureCookies: boolean;
  githubToken: string;
  githubOwner: string;
  githubWebhookSecret: string;
  telegramToken: string;
  telegramWebhookSecret: string;
  aiKey: string;
  aiModel: string;
  mailKey: string;
  mailFrom: string;
  encryptionKey: string;
  mockPayments: boolean;
  mockProvisioning: boolean;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): PortalConfig {
  const origin = new URL(env.PORTAL_ORIGIN || "http://localhost:3000").origin;
  const config: PortalConfig = {
    origin, database: env.PORTAL_DATABASE || ".cache/portal/portal.sqlite",
    port: Number(env.PORTAL_PORT || 3158), secureCookies: origin.startsWith("https:"),
    host: env.PORTAL_HOST || "127.0.0.1", staticDirectory: env.PORTAL_STATIC_DIR || "",
    stateDirectory: env.PORTAL_STATE_DIR || "", bootstrapEmployees: env.PORTAL_BOOTSTRAP_EMPLOYEES === "true",
    trustProxy: env.PORTAL_TRUST_PROXY === "true", revision: env.SOURCE_REVISION || "local",
    githubToken: env.PORTAL_GITHUB_TOKEN || "", githubOwner: env.PORTAL_GITHUB_OWNER || "Matthew-zzz",
    githubWebhookSecret: env.PORTAL_GITHUB_WEBHOOK_SECRET || "",
    telegramToken: env.PORTAL_TELEGRAM_TOKEN || "", telegramWebhookSecret: env.PORTAL_TELEGRAM_WEBHOOK_SECRET || "",
    aiKey: env.PORTAL_OPENAI_KEY || "", aiModel: env.PORTAL_OPENAI_MODEL || "",
    mailKey: env.PORTAL_RESEND_KEY || "", mailFrom: env.PORTAL_MAIL_FROM || "",
    encryptionKey: env.PORTAL_ENCRYPTION_KEY || "",
    mockPayments: env.PORTAL_MOCK_PAYMENTS === "true", mockProvisioning: env.PORTAL_MOCK_PROVISIONING === "true",
  };
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error("Invalid PORTAL_PORT");
  if (config.encryptionKey && !/^[a-f0-9]{64}$/.test(config.encryptionKey)) throw new Error("PORTAL_ENCRYPTION_KEY must be 32 random bytes in hex");
  return config;
}
