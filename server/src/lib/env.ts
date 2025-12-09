import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  ADMIN_API_KEY: z.string().optional(),
  ADMIN_SESSION_SECRET: z
    .string()
    .min(32)
    .default('dev-admin-session-secret-change-me-please-1234567890'),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().optional(),
  ADMIN_SESSION_REMEMBER_DAYS: z.coerce.number().optional(),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z
    .preprocess((value) => {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
      }
      return undefined;
    }, z.boolean().optional()),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  ADMIN_APP_URL: z.string().default('http://localhost:5173/admin'),
  ADMIN_RESET_URL: z.string().optional(),
  ADMIN_INVITE_URL: z.string().optional(),
  ADMIN_INVITE_TOKEN_TTL_MINUTES: z.coerce.number().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

const {
  ADMIN_SESSION_TTL_HOURS,
  ADMIN_SESSION_REMEMBER_DAYS,
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
  ADMIN_INVITE_TOKEN_TTL_MINUTES,
  SMTP_SECURE,
  ADMIN_RESET_URL,
  ADMIN_INVITE_URL,
  ...rest
} = parsed.data;

const sessionTtlHours = ADMIN_SESSION_TTL_HOURS ?? 12;
const rememberDays = ADMIN_SESSION_REMEMBER_DAYS ?? 30;
const resetTokenTtlMinutes = PASSWORD_RESET_TOKEN_TTL_MINUTES ?? 30;
const inviteTokenTtlMinutes = ADMIN_INVITE_TOKEN_TTL_MINUTES ?? (7 * 24 * 60);

export const env = {
  ...rest,
  ADMIN_SESSION_TTL_MS: sessionTtlHours * 60 * 60 * 1000,
  ADMIN_SESSION_REMEMBER_MS: rememberDays * 24 * 60 * 60 * 1000,
  PASSWORD_RESET_TOKEN_TTL_MS: resetTokenTtlMinutes * 60 * 1000,
  SMTP_SECURE: SMTP_SECURE ?? true,
  ADMIN_RESET_URL: ADMIN_RESET_URL ?? `${rest.ADMIN_APP_URL.replace(/\/$/, '')}/reset`,
  ADMIN_INVITE_URL: ADMIN_INVITE_URL ?? `${rest.ADMIN_APP_URL.replace(/\/$/, '')}/invite`,
  ADMIN_INVITE_TOKEN_TTL_MS: inviteTokenTtlMinutes * 60 * 1000
};

export type Env = typeof env;
