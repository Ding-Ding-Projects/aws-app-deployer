# Designer handoff: AWS App Deployer

## Product and current state

Build a local desktop application that lets people deploy containerized web applications into their own AWS accounts. The application itself runs locally; it is not a hosted deployment service. The repository is public: https://github.com/Ding-Ding-Projects/aws-app-deployer.

The user explicitly requested a local desktop runtime, multiple users connecting their own AWS accounts, one-click public deployment from a Dockerfile or Docker Compose file, automatic AWS infrastructure setup and recovery, and AWS browser sign-in that returns to the application. Windows is the initial packaging target; keep layouts and code portable. There is currently no shipped desktop interface, AWS-connected environment, or verified deployment. Do not present illustrations or sample statuses as live infrastructure.

## Ownership and parallel work

- Designer owns `design/` and, after the design handoff, `src/renderer/` and renderer-specific tests. Work on a dedicated branch and submit a pull request.
- AWS implementation owns `src/backend/` and `tests/backend/`. Do not modify these paths without coordinating the API.
- Integration owns the main process, preload bridge, package configuration, packaging, and root documentation.
- Keep credential handling and command execution out of the renderer. Do not add direct Node access, shell commands, remote script imports, or AWS credentials to UI code.
- Before implementation, provide `design/DESIGN.md` with task flows, component states, responsive layouts, design tokens, keyboard behavior, and annotated screen designs. Keep prototype and shipped screenshots distinguishable.

## Primary journeys

### 1. Connect AWS

First launch explains that deployments run in the selected AWS account and incur AWS charges. Offer an existing AWS CLI profile, or guided IAM Identity Center setup using the organization's access portal URL, SSO region, account, and role. Discover existing profiles; never silently pick a different account when one fails.

The Connect action starts AWS CLI v2 browser sign-in using its default PKCE flow. AWS CLI owns the localhost callback and credential cache. The desktop main process waits for completion, checks the signed-in identity, then restores focus to the app. Do not invent a generic AWS console OAuth redirect or implement a custom deep link that accepts credentials. Provide a clearly labelled manual device-flow alternative only if the backend supports it.

Show connection states: checking prerequisites, browser opened, waiting for sign-in, verifying account, connected, cancelled, timed out, expired session, and failed. Show verified account ID, role, profile, and region after success. Never show tokens or raw credential output. An AWS access portal URL is not the user's AWS console password.

Multiple users means independent OS-user credential stores and independently selected AWS profiles/accounts. Do not introduce a shared cloud user database or imply that local profile labels provide a security boundary between people sharing one OS account. This application has no separate app password or hosted user registration.

### 2. Create a deployment

Use a task-oriented wizard with Back/Next, a visible step list, save/resume for non-secret inputs, and a final target summary:

1. Select account/profile and region; verify identity.
2. Select a local `Dockerfile`, `compose.yaml`, or `docker-compose.yml` and its project folder. An authorized GitHub repository and production branch can be an additional source for automatic updates. Inspect the actual file and present the detected services and public entry point. An existing immutable ECR image is an optional advanced entry point, not a replacement for building the selected source.
3. Configure application name, container port, health-check path, task CPU/memory, and environment variable names. Secret values must use AWS Secrets Manager references and never enter saved drafts or logs.
4. Default networking is created automatically: VPC, subnets across two availability zones, routes, security groups, and the public Application Load Balancer. Advanced users may select existing networking. Region defaults to the selected profile's configured region; a missing region is resolved during initial connection setup. The default endpoint is the AWS-generated load-balancer DNS name over HTTP. A custom domain with ACM-backed HTTPS is optional, and missing HTTPS configuration must not block the default HTTP route.
5. Show a compact summary of the selected account, source, public entry point, and ongoing AWS resources/cost drivers. Do not fabricate cost estimates. After initial account setup and file selection, one **Deploy** action runs the entire workflow without manual commands, network setup, or repeated confirmations. Advanced settings stay optional.
6. Deploy, observe real progress, and copy or open the verified public URL.

One Application Load Balancer spanning two availability zones is the default, with two Fargate tasks. The UI must not suggest two independent load balancers unless the backend actually provisions them. Public application access uses the AWS-generated HTTP URL by default, with optional custom-domain HTTPS. The deployment tool must not add an authentication gate to the target by default: anyone can open the returned link. Authentication already implemented by the selected application remains intact. AWS operator sign-in grants deployment access only and is never presented as visitor authentication.

### 3. Follow deployment and recovery

Show real stages: inspect source and all Compose services, validate prerequisites, verify identity, build, publish immutable images, provision networking and load balancing, deploy services, wait for healthy targets, verify the public endpoint. Unsupported stages remain clearly unavailable. Stage results come from backend events, never timers.

The deployment detail view shows the source revision/image digest, selected AWS account and region, status, endpoint when verified, last update, health, and sanitized logs. Make the successful result prominent: a clickable URL with Copy link and Open actions. Return success only after AWS deployment completion, healthy load-balancer targets, and an endpoint probe. Never synthesize a success URL from an application name or display a merely allocated DNS name as healthy. Provide actionable errors for missing CLI/Docker, SSO expiry, insufficient permissions, certificate mismatch, invalid network selection, build failure, unhealthy tasks, and rollback.

Cancel stops local waiting or the active local build where supported; it does not imply that AWS has stopped an accepted CloudFormation operation. Explain the remaining remote operation and allow refresh/reconnect. Closing the app must not silently delete infrastructure. Destructive deletion is a separate explicit workflow.

### 4. Automatic repair and safe recovery

The user explicitly wants problems repaired automatically where supported. Classify errors before choosing a recovery action. Retry transient network, throttling, and readiness failures with bounded backoff and a visible retry budget. Reuse valid prerequisites; acquire and verify supported missing dependencies through trusted installers where the platform permits it. Never automate native elevation consent or claim that unavailable dependencies are installed.

For known recoverable deployment failures, show what was detected, the exact supported repair attempted, and its actual result. Keep retries idempotent: reconcile a timed-out cloud operation before retrying a mutation. Unhealthy releases should trigger the platform's supported rollback and preserve the last working service. Keep a sanitized recovery history.

Missing account permissions, billing/account restrictions, unsupported Compose features, invalid application source, and user-owned authentication prompts may require user action. Do not promise universal self-repair, silently edit application source, broaden permissions, disable security, delete data, or retry forever. Show the exact blocker, what remains running, and the smallest next action. Automatic repair must never manufacture a successful deployment.

### 5. Compose compatibility

Inspect every service before creating cloud resources. The intended product supports Dockerfile projects and Compose projects, including their build contexts, image references, application ports, environment configuration, service relationships, and supported storage mappings. Keep internal services internal and expose only the selected public application entry point. Localhost and host-bind assumptions must be explained or translated using a supported implementation, not silently ignored.

The first backend implementation is being limited to a validated single-service Compose subset. Multi-service orchestration and advanced storage/network mappings are not implemented yet. The UI must report unsupported services and fields before provisioning, with the affected service and feature. Never label the whole Compose format supported based only on this initial subset.

### 6. Automatic updates

The target experience is commit-triggered builds, immutable image publication, rolling deployment, health verification, and automatic rollback of unhealthy releases. Cloud automation must continue while the desktop app is closed. Clearly distinguish automatic delivery from local polling. Until a repository pipeline is connected and verified, show automatic updates as not configured.

## Navigation and visual direction

Use a polished Material 3 desktop interface with an account/region selector, deployment overview, New deployment action, deployment details, Connections, Settings, and Help. Lead with tasks and meaningful empty states, not raw command forms or a file catalogue. Support light/dark themes, visible focus, accessible names, keyboard navigation, reduced motion, readable contrast, and narrow windows without clipped controls. Save user presentation settings locally.

Include contextual documentation, onboarding progress and recovery, and searchable settings. Broader product requirements such as personal wording import, per-search regex tooling, localization, and optional sound effects need real behavior and tests; do not add decorative controls or claim these complete from mockups. Keep imported personal wording local to the user and out of source, telemetry, logs, and exports.

## Desktop integration boundary

The renderer uses a narrowly scoped preload bridge, not raw IPC. The integration owner will expose account listing, connection, identity verification, prerequisite checks, validated deployment planning, deployment execution/status, cancellation, and subscription to sanitized progress. Treat these as capability requirements until the exact backend exports are integrated; do not independently invent a competing API.

The current backend module contract is `src/backend/index.js`: `createBackend({run?})` exposes `profiles(options)`, `profileRegion(profile, options)`, `identity({profile, region}, options)`, `login({profile, region}, options)`, `verifyDeployment(selection, expectedIdentity, options)`, and `prerequisites(options)`. Operations accept an `AbortSignal` and return `{ok: true, ...}` or `{ok: false, error: code}`. Identity results carry `accountId`, `arn`, `userId`, `profile`, and `region`. `login` succeeds only after browser sign-in and STS verification. These are backend functions, not permission to expose arbitrary function dispatch through IPC. Infrastructure execution and automatic pipeline integration remain pending.

The deployment module adds `createDeployer({run?, backend?, pause?, fetchUrl?, uuid?, now?})` with `inspectCompose(absoluteComposePath, {signal}?)` and `deploy(input, {signal, onProgress}?)`. Deployment input includes `profile`, `region`, the last verified `expectedIdentity`, application `name`, and `source`. A Dockerfile source has `{kind: 'dockerfile', contextPath, dockerfilePath}` with absolute paths; a Compose source has `{kind: 'compose', composePath}`. Optional settings include container port, health-check path, environment, custom-domain HTTPS, and existing-network identifiers. The standard route creates networking automatically. Progress reports the active stage; the desktop bridge must attach its own operation ID. Success carries the verified `url`, image digest reference, stack name and identity. Failure carries a code, stage, and whether resources may already exist; never map failure to a completed progress bar.

Every long-running operation has an operation ID and an explicit terminal status. Events must stay scoped to the selected operation/account. Switching an account cannot silently retarget an operation already running. All renderer inputs are validated again in the main/backend process. External URLs are opened only after protocol and destination checks.

## Required design delivery and acceptance

Deliver annotated screens for onboarding, profile selection, AWS browser return, deployment wizard/review, running deployment, healthy deployment, failure/rollback, expired sign-in, and settings. Include empty, loading, error, disabled, cancellation, and recovery states, plus keyboard order and small-window behavior.

Submit a design-only pull request first so implementation ownership can be coordinated. If implementing the renderer, connect real bridge operations and test keyboard flows, account switching, failed/cancelled sign-in, draft restoration, progress isolation, and truthful unavailable states. Include inspected screenshots from the built app and label any prototype captures clearly. Keep all public source and records free of credentials, private instructions, or local account configuration.

## Outstanding external verification

Real AWS sign-in and deployment require a user-connected AWS profile and access portal/account role. Networking is intended to be provisioned automatically; a domain and certificate are required only for optional custom-domain HTTPS. Those are not available in the development environment. Windows packaged-app execution must be verified on Windows. Record these limitations explicitly until actual evidence is available.


## Latest implementation status

- Canonical repository and this handoff are published; the collaborating designer owns the desktop design and renderer work.
- Backend profile discovery, AWS CLI 2.22+ browser SSO invocation, identity verification, bounded command execution, infrastructure generation, and deployment orchestration are implemented. All 24 local backend tests pass. They mock AWS and Docker and do not prove a live deployment. Stack and image-repository ownership tags are checked before reusing resources; unrelated resources with the same names are rejected.
- The backend supports source build, ECR publication, automatic network provisioning, CloudFormation deployment, public-URL verification, and strict single-service Compose intake. The UI still needs to invoke these operations through the desktop bridge. Unknown or unsupported Compose features are rejected before provisioning; this is not full Compose compatibility.
- The design handoff is in `design/` (artboards, tokens, prototype renders, review record).
- Desktop integration now exists: `src/main/` exposes the backend through a named preload bridge with operation IDs and scoped events, adds a one-click Windows dependency installer and a local settings store, and `src/renderer/` implements the designed screens. Every push to `main` builds a Windows installer, captures screenshots of the built app on a Windows runner, and publishes a tagged release. See `ROADMAP.md` for the exact shipped, partial and not-started list.
- Full multi-service Compose support, comprehensive automatic repair, cloud update pipelines, code signing, and live AWS evidence remain unfinished. The installer has been tested with stand-in commands, not yet on a clean Windows machine.


### Deployment implementation constraints

The current default creates two private Fargate tasks behind a public ALB, with one NAT gateway. Show the NAT gateway as an ongoing cost driver and explain its single-zone egress availability limit. Task sizing is currently fixed at 0.25 vCPU and 512 MiB; do not present adjustable sizing as wired until the backend supports it. The application must listen on all container interfaces. When the Dockerfile exposes exactly one TCP port, the backend can infer it; otherwise require a port selection before deployment.

Current Compose support accepts exactly one application service with a simple local build or image, one TCP port, and resolved ordinary environment values. Volumes, secrets, databases, dependency orchestration, command overrides, custom networks, privileged settings, and multi-service deployment remain unsupported and must be shown as such. Private-registry base-image authentication is not inherited into the isolated build credential context.

The backend's automatic repair currently covers bounded retries of classified transient read-only AWS failures and ECS deployment circuit-breaker rollback. It does not yet install prerequisites, fix source code, change IAM permissions, repair billing, or implement general self-healing. Custom-domain HTTPS needs an existing matching ACM certificate and DNS directed to the ALB; the normal HTTP path needs neither. Do not claim a working endpoint or native desktop release without live evidence.
