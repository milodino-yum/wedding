import { Hono } from "hono";
import type { AppEnv, Ctx } from "../types";
import {
  consumeLoginToken,
  createSession,
  createUser,
  destroySession,
  issueLoginToken,
  type SigninPayload,
  type SignupPayload,
} from "../auth";
import { claimInviteUse, findInviteByCode, getUserByEmail, inviteStatus } from "../db";
import { sendEmail, signInEmail } from "../email";
import { adminEmails, field, normalizeEmail, normalizeInviteCode, now, safeNext } from "../lib/util";
import { render } from "../views/layout";
import {
  CheckEmail,
  ConfirmSignIn,
  EnterInviteCode,
  InviteInvalid,
  JoinForm,
  LinkProblem,
  SignInForm,
} from "../views/auth";

export const authRoutes = new Hono<AppEnv>();

const isDev = (c: Ctx) => c.env.DEV_MODE === "true";
const origin = (c: Ctx) => new URL(c.req.url).origin;

async function sendLink(
  c: Ctx,
  email: string,
  purpose: "signin" | "signup",
  payload: SigninPayload | SignupPayload,
  name: string | null,
): Promise<{ ok: true; devLink: string | null } | { ok: false; status: 429 | 500; message: string }> {
  const issued = await issueLoginToken(c.env, email, purpose, payload);
  if (!issued.ok) {
    return {
      ok: false,
      status: 429,
      message: "We've sent several links to this address in the last hour. Please use the most recent email, or try again later.",
    };
  }
  const link = `${origin(c)}/auth/verify?token=${issued.token}`;
  try {
    await sendEmail(c.env, signInEmail({ siteName: c.env.SITE_NAME, to: email, link, name, isNew: purpose === "signup" }));
  } catch (err) {
    console.error("sendEmail failed", err);
    return { ok: false, status: 500, message: "Sorry, we couldn't send the email just now. Please try again in a few minutes." };
  }
  return { ok: true, devLink: isDev(c) ? link : null };
}

// --- Sign in -----------------------------------------------------------------

authRoutes.get("/signin", (c) => {
  if (c.get("user")) return c.redirect("/");
  return render(c, "Sign in", <SignInForm next={safeNext(c.req.query("next"))} />);
});

authRoutes.post("/signin", async (c) => {
  const form = await c.req.parseBody();
  const next = safeNext(form.next);
  const email = normalizeEmail(form.email);
  if (!email) {
    return render(c, "Sign in", <SignInForm next={next} email={String(form.email ?? "")} error="Please enter a valid email address." />, 400);
  }

  const user = await getUserByEmail(c.env.DB, email);
  let devLink: string | null = null;
  // Only existing members (and the configured admins, for bootstrapping) get
  // a link, but the response looks the same either way so the page can't be
  // used to check who is a member.
  if (user || adminEmails(c.env).has(email)) {
    const sent = await sendLink(c, email, "signin", { next }, user?.display_name ?? null);
    if (!sent.ok) return render(c, "Sign in", <SignInForm next={next} email={email} error={sent.message} />, sent.status);
    devLink = sent.devLink;
  }
  return render(c, "Check your email", <CheckEmail email={email} devLink={devLink} />);
});

// --- Join with an invite ---------------------------------------------------------

authRoutes.get("/join", (c) => render(c, "Join", <EnterInviteCode />));

authRoutes.post("/join", async (c) => {
  const form = await c.req.parseBody();
  const code = normalizeInviteCode(String(form.code ?? ""));
  if (!code) return render(c, "Join", <EnterInviteCode error="Invite codes have 8 letters and numbers, like K7QM-4XRT." />, 400);
  return c.redirect(`/join/${code}`);
});

async function loadInvite(c: Ctx) {
  const code = normalizeInviteCode(c.req.param("code") ?? "");
  const invite = code ? await findInviteByCode(c.env.DB, code) : null;
  if (!invite) return { invite: null, status: "unknown" } as const;
  const status = inviteStatus(invite, now());
  return status === "active" ? ({ invite, status } as const) : ({ invite: null, status } as const);
}

authRoutes.get("/join/:code", async (c) => {
  const { invite, status } = await loadInvite(c);
  if (!invite) return render(c, "Invite", <InviteInvalid status={status} />, 404);
  if (c.req.param("code") !== invite.code) return c.redirect(`/join/${invite.code}`);
  return render(c, "Join", <JoinForm siteName={c.env.SITE_NAME} invite={invite} />);
});

authRoutes.post("/join/:code", async (c) => {
  const { invite, status } = await loadInvite(c);
  if (!invite) return render(c, "Invite", <InviteInvalid status={status} />, 404);

  const form = await c.req.parseBody();
  const display_name = field(form, "display_name", 80);
  const relationship = field(form, "relationship", 200);
  const email = normalizeEmail(form.email);
  const values = { display_name, relationship, email: email ?? String(form.email ?? "") };
  const showError = (error: string, code: 400 | 429 | 500 = 400) =>
    render(c, "Join", <JoinForm siteName={c.env.SITE_NAME} invite={invite} values={values} error={error} />, code);

  if (!display_name) return showError("Please tell us your name.");
  if (!email) return showError("Please enter a valid email address.");

  const existing = await getUserByEmail(c.env.DB, email);
  const sent = existing
    ? await sendLink(c, email, "signin", { next: "/" }, existing.display_name)
    : await sendLink(c, email, "signup", { display_name, relationship, invite_id: invite.id }, display_name);
  if (!sent.ok) return showError(sent.message, sent.status);
  return render(c, "Check your email", <CheckEmail email={email} devLink={sent.devLink} joining />);
});

// --- The link in the email ----------------------------------------------------

// GET only shows a button. Email security scanners (Outlook, Mimecast, ...)
// open links before the person does; if GET signed you in, the scanner would
// use up the one-time link.
authRoutes.get("/auth/verify", (c) => {
  // The token is in this page's URL. The site-wide "same-origin" referrer
  // policy keeps it from being sent to any other site. (Not "no-referrer":
  // older iPads would then send `Origin: null` with the Continue button and
  // fail the CSRF check.)
  const token = c.req.query("token");
  if (!token) return render(c, "Sign in", <LinkProblem message="This link is incomplete. Try copying the whole link from the email." />, 400);
  return render(c, "Sign in", <ConfirmSignIn token={token} />);
});

authRoutes.post("/auth/verify", async (c) => {
  const form = await c.req.parseBody();
  const token = typeof form.token === "string" ? form.token : "";
  const consumed = token ? await consumeLoginToken(c.env, token) : null;
  if (!consumed) {
    return render(
      c,
      "Sign in",
      <LinkProblem message="This link has expired or has already been used. Links work once, for one hour." />,
      400,
    );
  }

  const isAdminEmail = adminEmails(c.env).has(consumed.email);
  let user = await getUserByEmail(c.env.DB, consumed.email);
  let isNew = false;

  if (!user && consumed.purpose === "signup") {
    const p = consumed.payload as SignupPayload;
    if (!(await claimInviteUse(c.env.DB, p.invite_id, now()))) {
      return render(
        c,
        "Join",
        <LinkProblem message="The invite you used is no longer valid (it may have been used up or revoked). Ask whoever sent it for a new one." />,
        400,
      );
    }
    user = await createUser(c.env, {
      email: consumed.email,
      display_name: p.display_name,
      relationship: p.relationship,
      role: isAdminEmail ? "admin" : "member",
      invite_id: p.invite_id,
    });
    isNew = true;
  } else if (!user && isAdminEmail) {
    // First sign-in by a configured admin: no invite needed.
    user = await createUser(c.env, { email: consumed.email, display_name: consumed.email.split("@")[0]!, role: "admin" });
    isNew = true;
  } else if (!user) {
    return render(c, "Sign in", <LinkProblem message="We couldn't find your account. Ask the family historian for an invite." />, 400);
  }

  await destroySession(c); // drop any session that was already on this device
  await createSession(c, user.id);
  if (isNew) return c.redirect("/me?notice=welcome");
  const next = consumed.purpose === "signin" ? safeNext((consumed.payload as SigninPayload).next) : "/";
  return c.redirect(next);
});

authRoutes.post("/signout", async (c) => {
  await destroySession(c);
  return c.redirect("/?notice=signed-out");
});
