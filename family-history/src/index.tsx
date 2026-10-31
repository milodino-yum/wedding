import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv } from "./types";
import { loadUser } from "./auth";
import { authRoutes } from "./routes/auth";
import { appRoutes, homePage } from "./routes/app";
import { render } from "./views/layout";
import { Landing } from "./views/auth";

const app = new Hono<AppEnv>();

app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      objectSrc: ["'none'"],
    },
    // Not "no-referrer": that makes browsers send `Origin: null` on form
    // posts, which the CSRF check below would reject.
    referrerPolicy: "same-origin",
    xFrameOptions: "DENY",
  }),
);
// Rejects form posts from other sites (checks Origin / Sec-Fetch-Site).
app.use(csrf());
app.use(async (c, next) => {
  await next();
  c.header("X-Robots-Tag", "noindex, nofollow");
  if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "private, no-store");
});
app.use(loadUser);

app.get("/", (c) => {
  if (c.get("user")) return homePage(c);
  return render(c, c.env.SITE_NAME, <Landing siteName={c.env.SITE_NAME} />);
});

app.route("/", authRoutes);
app.route("/", appRoutes);

app.notFound((c) =>
  render(
    c,
    "Not found",
    <section class="card narrow">
      <h1>We couldn't find that page</h1>
      <p>
        <a href="/">Go to the home page</a>
      </p>
    </section>,
    404,
  ),
);

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse(); // e.g. CSRF rejection (403)
  console.error(err);
  return render(
    c,
    "Something went wrong",
    <section class="card narrow">
      <h1>Something went wrong</h1>
      <p>Sorry about that. Please try again in a moment.</p>
    </section>,
    500,
  );
});

export default app;
