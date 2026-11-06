# Browser preview

The desktop application remains the primary product. The browser companion reuses its interface and deployment backend, with AWS console sign-in for a browser on another device. This is an operator preview, not an anonymous public deployment service. Deployed applications still use their own public load-balancer URLs.

## Start locally

Install Docker with Compose. Generate a private access key and launch the companion:

```sh
export AWS_DEPLOYER_ACCESS_TOKEN="$(openssl rand -hex 32)"
docker compose -p aws-preview -f compose.preview.yaml up --build -d
```

Open `http://localhost:8787` and enter that key. Do not commit it or put it in a URL query. The interface also accepts a `#token=...` fragment and removes it after intake. Never share that full link publicly.

The companion runs as a non-root user. Compose creates a dedicated Docker-in-Docker engine with TLS and no host Docker socket mount. That engine needs privileged-container support; its API is not published to the host. Use this preview for trusted operators and source projects. It is not a hardened public service for arbitrary untrusted builds.

On hosts that cannot start the dedicated engine, an authentication-only check can run with `docker compose -p aws-preview -f compose.preview.yaml up --build -d --no-deps companion`. Docker is then correctly reported unavailable and deployments cannot run. The current managed host denies nested engine cgroup access.

Each authenticated browser session has separate AWS configuration, credential caches, source files, settings and Docker client configuration. Sessions expire after 30 minutes. Sign out or expiration cancels local operations and removes session files; it does not delete AWS infrastructure or revoke every AWS-issued session. Save a returned deployment URL separately.

## Connect AWS

Choose the profile label and region, then Connect. Open the AWS authorization link, sign in directly on AWS, and paste AWS's returned authorization code into the companion. The server runs `aws login --remote` and checks the resulting identity with STS before showing Connected. Credentials never belong in chat, source files or UI drafts. No AWS resources are created merely by connecting.

Upload a project directory containing a Dockerfile, or choose the built-in sample. Uploads are bounded and reject path traversal and duplicates. Browser Compose intake is currently rejected before invoking Docker because the desktop Compose resolver can read referenced host files. Desktop single-service Compose support remains available; browser Compose support needs a separately validated resolver. Archives are not extracted.

Review the account, region and project before Deploy. The backend builds an image, publishes to ECR and provisions the existing ECS/ALB stack. ALB, Fargate tasks and a NAT gateway incur AWS charges. Success requires healthy targets and a responding endpoint. Cancellation or session expiration does not roll back AWS resources; deletion remains a separate, currently unfinished product feature.

## Temporary Cloudflare link

On a host with supported Cloudflare Tunnel connectivity, run:

```sh
cloudflared tunnel --url http://localhost:8787 --protocol http2 --no-autoupdate
```

After Cloudflare supplies the real HTTPS address, set `AWS_DEPLOYER_PUBLIC_ORIGIN` to that exact origin (no trailing slash) and recreate the companion:

```sh
export AWS_DEPLOYER_PUBLIC_ORIGIN=https://ACTUAL-NAME.trycloudflare.com
docker compose -p aws-preview -f compose.preview.yaml up -d companion
```

Keep the tunnel running, verify the address in an independent browser, and enter the private access key. Exact-origin validation protects API requests; HTTPS sessions receive Secure cookies. Quick Tunnel addresses are temporary and have no uptime guarantee.

The current managed environment refused the Quick Tunnel API connection on 2026-11-06. A live public preview and real AWS account login have **not** been verified. The network policy must support Cloudflare's required outbound connections before this step can succeed; changing application code or inventing an address does not resolve that blocker.

## Stop and troubleshoot

```sh
docker compose -p aws-preview -f compose.preview.yaml down
```

Stop the owned `cloudflared` process too. Docker image caches remain in the dedicated engine volume; `down --volumes` removes those local caches when desired, not AWS resources. Do not delete shared host data.

For proxy-based environments, preserve the configured proxy addresses and mount their trusted CA read-only. Set `AWS_CA_BUNDLE` and `NODE_EXTRA_CA_CERTS` to the mounted bundle; never disable certificate checks. The nested Docker engine needs its own supported proxy/trust configuration for remote builds. A locally successful interface check does not establish AWS or registry connectivity.

See [the feature audit](FEATURE-AUDIT.md) for remaining requirements and [the designer handoff](../HANDOFF.md) for integration boundaries.

## Verification recorded on 2026-11-06

The local container successfully served the real interface in Chromium. Access-key entry, actual AWS CLI authorization-link generation, cancellation, sample source inspection, uploaded Dockerfile inspection and sign-out passed with no browser page errors. The CLI was AWS CLI 2.39.5. These checks did not submit a real AWS authorization code or create AWS resources. Automated checks cover isolated sessions, denied login, failed STS verification, cancellation, expiry, late-write cleanup, concurrent login, source traversal and secret redaction.

Actual local captures: [desktop](evidence/browser-login-desktop.png), [mobile](evidence/browser-login-mobile.png). [Verification record and source hashes](evidence/browser-check.json). The screenshots show an authorization request awaiting the user, not a connected AWS account.

The latest integration has 66 passing automated checks. Earlier captures and their original hashes are preserved in [the initial preview record](evidence/initial-preview/browser-check.json).
