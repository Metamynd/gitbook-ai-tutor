# Deployment

This is optional — the app runs fine locally or on any Node host without
any of this. This document covers one concrete way to run it in
production: Docker Compose on a server you control, deployed by GitHub
Actions whenever you push a release tag.

If you'd rather deploy to Vercel, Railway, Fly.io, or similar, you mostly
just need `DATABASE_URL` and the other env vars from `.env.example` — the
Docker/SSH setup below isn't required.

## One-time server setup

1. **Directory.** Pick a path on your server for the checkout (e.g.
   `/srv/tutor`). The first deploy clones the repo there automatically if
   it doesn't exist yet — you don't need to clone it manually first.

2. **`.env.production`** — copy [`.env.production.example`](.env.production.example)
   to `<that-path>/.env.production` on the server and fill in real values
   (OpenRouter key, a Postgres password, the admin token, etc.). This file
   is never committed — `deploy.yml` checks it exists and fails the
   deploy cleanly if it's missing, rather than half-deploying.

3. **Reverse proxy** — point your domain/subdomain at
   `http://localhost:3300` (the port `docker-compose.yml` publishes). The
   app serves at root with no `basePath` (see `next.config.mjs`), so this
   is a plain proxy with nothing path-related to get right. Two directives
   are load-bearing and easy to miss, since the proxy config lives outside
   this repo entirely, on your server (nginx examples, adapt for your
   proxy of choice):

   - **`proxy_buffering off;`** on `/api/tutor/stream` — the only
     streaming route in the app. Left at nginx's default, the entire
     response arrives at once when the LLM finishes generating instead of
     token-by-token as it's written — the user sees nothing, then the
     whole answer appears at once, silently defeating the whole point of
     streaming without ever producing an error.
   - **`client_max_body_size 25M;`** (or similar) — for
     `/api/tutor/transcribe` (voice input — stubbed today, see Roadmap in
     the README). nginx's `1m` default 413s a real audio recording.

   Neither of these shows up in a smoke test that only checks status
   codes and body content — a broken-streaming or too-small-body-limit
   deploy would look identical to a working one to `scripts/deploy/smoke.mjs`.
   Verify streaming for real: curl the stream endpoint and confirm chunks
   arrive continuously over several seconds, not as one blob at the end.

4. **Docker + Docker Compose** installed on the server, and the SSH user
   `deploy.yml` logs in as must be in the **`docker` group** —
   `sudo usermod -aG docker <user>` — otherwise the deploy fails with
   `permission denied while trying to connect to the docker API`.

5. **`.env.production` must be readable by that same deploy user**, not
   just `root` — `docker compose` runs as whichever user SSHed in, so a
   file created with `sudo` and left at default permissions can still
   block the deploy with `open .../.env.production: permission denied`.
   Verify with:
   ```bash
   sudo -u <deploy-user> cat <deploy-path>/.env.production
   ```
   If that fails, `chown`/`chmod` the file (and, if needed, its parent
   directory — a `700` dir owned by `root` blocks access even to a
   world-readable file inside it).

## GitHub repo setup

Add these as repository secrets (Settings → Secrets and variables →
Actions):

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | Your server's hostname/IP |
| `DEPLOY_USER` | SSH user with Docker access on that server |
| `DEPLOY_SSH_KEY` | Private key for that user (server login only — see below for how the server authenticates to GitHub) |
| `DEPLOY_PATH` | Absolute path for the checkout, e.g. `/srv/tutor` |
| `REPO_TOKEN` | Fine-grained GitHub PAT, see below |
| `DEPLOY_BASE_URL` | Your production URL, e.g. `https://tutor.your-domain.com` — used by the post-deploy smoke test |

**`REPO_TOKEN`**: the server's own `git clone`/`git fetch` of this repo
needs credentials separate from `DEPLOY_SSH_KEY` (which only gets the
Actions runner *onto* the server). A plain SSH clone
(`git@github.com:...`) commonly fails on a server's very first,
non-interactive clone with "Host key verification failed" (nothing
prompts to accept GitHub's host key the way an interactive first clone
would), and a read-only SSH **Deploy Key** — the standard alternative —
is disabled by policy on some GitHub orgs. HTTPS + a token sidesteps both
issues:

1. Create a **fine-grained PAT** (GitHub → Settings → Developer settings
   → Fine-grained tokens → New token) scoped to `Repository access: only
   this repo`, permission `Contents: Read-only`.
2. Save it as the `REPO_TOKEN` secret.

`deploy.yml` clones via `https://x-access-token:$REPO_TOKEN@github.com/...`,
which needs no `known_hosts`/SSH setup on the server for this step. The
token ends up embedded in `<deploy-path>/.git/config` on the server —
expected for an automated deploy credential, the same exposure an SSH
private key on disk would have. If the token is ever rotated, re-clone
the directory (or update the `origin` remote URL) — the old value is
baked into that one clone, not re-read from the secret afterward.

## Releasing

```bash
git tag v1.0.0
git push --tags
```

That's it — pushing a `v*` tag is the only thing that triggers a deploy.
Pushing to your default branch does not. To redeploy the same tag or
deploy a specific commit without cutting a new one, run the **Deploy to
server** workflow manually from the Actions tab with a `ref` input.

## What the workflow actually does

See [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) for
the full script. In short: `git fetch && git reset --hard <tag>` on the
server, `docker compose up -d --build`, then `db-push.mjs` inside the
running container to apply any new schema (idempotent — safe to run
every deploy). A final step checks out the same tag on the **runner**
(not the server) and hits your real production URL through the actual
reverse proxy, the same path a visitor takes — a green container isn't
proof the product works, only that it started.

## Local Docker testing

Before trusting any of the above in production, verify it locally first:

```bash
cp .env.production.example .env.production   # fill in real values, pointed at the "postgres" service host
docker compose up -d --build
docker compose exec -T tutor node scripts/db-push.mjs
curl -I http://localhost:3300   # expect 200
```

Then exercise the chat, quiz, admin, and progress flows in a browser at
`http://localhost:3300` — don't trust a successful `next build` alone.
Two real bugs only ever showed up this way, not in CI:

- **`output: "standalone"` can trace the wrong workspace root** if an
  unrelated `package-lock.json` (or similar) exists in a parent
  directory outside this repo — Next silently infers the wrong project
  root and `.next/standalone` ends up missing this app entirely. Fixed
  with `outputFileTracingRoot` in `next.config.mjs`, already set in this
  template — but worth knowing if you ever see a container that starts
  but 404s on everything.
- **`content/` (system prompt, level guidance, learning paths) is read
  via `fs.readFileSync` at request time, not imported** — Next's
  standalone output tracing only follows static imports, so it silently
  omits anything read this way. Every real chat message would fail right
  after retrieval succeeded, with an uncaught ENOENT. The `Dockerfile`
  already `COPY`s `content/` explicitly for this reason — if you add new
  runtime-read files elsewhere, you'll need to copy those too.

If you change how content is loaded or add new runtime-read files, rerun
this local Docker test before assuming a green `next build` means the
container actually works.
