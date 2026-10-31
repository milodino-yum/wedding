import type { Context } from "hono";

export type Env = {
  DB: D1Database;
  SITE_NAME: string;
  EMAIL_FROM: string;
  /** Secret. Comma-separated addresses that may sign in without an invite. */
  ADMIN_EMAILS?: string;
  RESEND_API_KEY?: string;
  /** "true" only in .dev.vars / tests: shows sign-in links on screen. */
  DEV_MODE?: string;
};

export type User = {
  id: string;
  email: string;
  display_name: string;
  relationship: string | null;
  bio: string | null;
  person_id: string | null;
  role: "member" | "admin";
  created_at: number;
  last_seen_at: number | null;
};

export type Person = {
  id: string;
  gedcom_xref: string | null;
  given_names: string | null;
  surname: string | null;
  nickname: string | null;
  sex: "M" | "F" | "U" | null;
  birth_date: string | null;
  birth_year: number | null;
  birth_place: string | null;
  death_date: string | null;
  death_year: number | null;
  death_place: string | null;
  is_living: number;
  summary: string | null;
};

export type Invite = {
  id: string;
  code: string;
  label: string | null;
  max_uses: number | null;
  uses: number;
  expires_at: number | null;
  created_by: string | null;
  created_at: number;
  revoked_at: number | null;
};

export type Anecdote = {
  id: string;
  person_id: string;
  author_id: string | null;
  body: string;
  heard_from: string | null;
  created_at: number;
  updated_at: number;
};

export type AppEnv = {
  Bindings: Env;
  Variables: { user: User | null };
};

export type Ctx = Context<AppEnv>;
