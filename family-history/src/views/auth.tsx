import type { Invite } from "../types";
import { TreeMark } from "./layout";

export function Landing(props: { siteName: string }) {
  return (
    <section class="hero">
      <div class="hero-mark">
        <TreeMark />
      </div>
      <h1>{props.siteName}</h1>
      <p class="lede">
        A private place for our family's people, places and stories, and for the memories only you can add.
      </p>
      <div class="actions center">
        <a class="button primary" href="/signin">
          Sign in
        </a>
        <a class="button" href="/join">
          I have an invite
        </a>
      </div>
      <p class="muted small">Family members only. New here? Ask the family historian for an invite link.</p>
    </section>
  );
}

export function SignInForm(props: { next?: string; email?: string; error?: string }) {
  return (
    <section class="card narrow">
      <h1>Sign in</h1>
      <p>Enter your email and we'll send you a link. No password to remember.</p>
      {props.error && <p class="error">{props.error}</p>}
      <form method="post" action="/signin" class="stack">
        <input type="hidden" name="next" value={props.next ?? "/"} />
        <label for="email">Your email address</label>
        <input id="email" name="email" type="email" autocomplete="email" required value={props.email ?? ""} />
        <button type="submit" class="primary">
          Email me a sign-in link
        </button>
      </form>
      <p class="muted small">
        Haven't joined yet? <a href="/join">Use your invite</a>.
      </p>
    </section>
  );
}

export function CheckEmail(props: { email: string; devLink: string | null; joining?: boolean }) {
  return (
    <section class="card narrow">
      <h1>Check your email</h1>
      <p>
        {props.joining ? "We've sent a link to " : "If "}
        <strong>{props.email}</strong>
        {props.joining
          ? ". Click the button in that email to finish joining."
          : " belongs to a family member, we've sent a sign-in link to it."}
      </p>
      <p class="muted">
        The link works once and expires in an hour. It can take a minute to arrive; check your spam or "Promotions" folder
        if you don't see it.
      </p>
      {props.devLink && (
        <div class="dev-box">
          <strong>Development mode:</strong> email isn't being sent, so here is the link.
          <br />
          <a href={props.devLink} id="dev-link">
            Open sign-in link
          </a>
        </div>
      )}
    </section>
  );
}

export function EnterInviteCode(props: { error?: string }) {
  return (
    <section class="card narrow">
      <h1>Join the family site</h1>
      <p>If someone sent you an invite link, just click it. If you have a code (it looks like K7QM-4XRT), type it here.</p>
      {props.error && <p class="error">{props.error}</p>}
      <form method="post" action="/join" class="stack">
        <label for="code">Invite code</label>
        <input id="code" name="code" autocomplete="off" autocapitalize="characters" required class="code-input" />
        <button type="submit" class="primary">
          Continue
        </button>
      </form>
      <p class="muted small">
        Already joined? <a href="/signin">Sign in</a>.
      </p>
    </section>
  );
}

export function JoinForm(props: {
  siteName: string;
  invite: Invite;
  values?: { display_name?: string | null; email?: string | null; relationship?: string | null };
  error?: string;
}) {
  const v = props.values ?? {};
  return (
    <section class="card narrow">
      <h1>Welcome to {props.siteName}</h1>
      <p>You've been invited to join. Tell us who you are and we'll email you a link to finish.</p>
      {props.error && <p class="error">{props.error}</p>}
      <form method="post" action={`/join/${props.invite.code}`} class="stack">
        <label for="display_name">Your name</label>
        <input id="display_name" name="display_name" autocomplete="name" required maxlength={80} value={v.display_name ?? ""} />
        <span class="hint">The way the family knows you, e.g. "Aunt Ruth" or "Ruth Miller".</span>

        <label for="email">Your email address</label>
        <input id="email" name="email" type="email" autocomplete="email" required value={v.email ?? ""} />

        <label for="relationship">How are you part of the family? (optional)</label>
        <input
          id="relationship"
          name="relationship"
          maxlength={200}
          placeholder="e.g. Margaret's granddaughter"
          value={v.relationship ?? ""}
        />

        <button type="submit" class="primary">
          Email me a link to join
        </button>
      </form>
    </section>
  );
}

export function InviteInvalid(props: { status: string }) {
  return (
    <section class="card narrow">
      <h1>This invite can't be used</h1>
      <p>
        {props.status === "unknown"
          ? "We couldn't find that invite code. Check it for typos, or ask whoever sent it for a new one."
          : `This invite has ${props.status === "used up" ? "already been used" : `been ${props.status}`}. Ask whoever sent it for a new one.`}
      </p>
      <p>
        Already a member? <a href="/signin">Sign in</a>.
      </p>
    </section>
  );
}

export function ConfirmSignIn(props: { token: string }) {
  return (
    <section class="card narrow center-text">
      <h1>Almost there</h1>
      <p>Click the button to finish signing in on this device.</p>
      <form method="post" action="/auth/verify">
        <input type="hidden" name="token" value={props.token} />
        <button type="submit" class="primary big">
          Continue
        </button>
      </form>
    </section>
  );
}

export function LinkProblem(props: { message: string }) {
  return (
    <section class="card narrow">
      <h1>That link didn't work</h1>
      <p>{props.message}</p>
      <p>
        <a class="button primary" href="/signin">
          Send me a new link
        </a>
      </p>
    </section>
  );
}
