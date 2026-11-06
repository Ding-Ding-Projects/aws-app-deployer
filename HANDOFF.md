# Designer handoff: AWS App Deployer

## Product and current state

Build a local desktop application that lets people deploy containerized web applications into their own AWS accounts. The application itself runs locally; it is not a hosted deployment service. The repository is public: https://github.com/Ding-Ding-Projects/aws-app-deployer.

The user explicitly requested a local desktop runtime, multiple users connecting their own AWS accounts, automatic deployment behind load balancers, and AWS browser sign-in that returns to the application. Windows is the initial packaging target; keep layouts and code portable. There is currently no shipped desktop interface, AWS-connected environment, or verified deployment. Do not present illustrations or sample statuses as live infrastructure.

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
2. Select the project source and production branch. The intended full workflow is an authorized GitHub repository with a Dockerfile; an existing immutable ECR image is a useful supported entry point, clearly labelled as such.
3. Configure application name, container port, health-check path, task CPU/memory, and environment variable names. Secret values must use AWS Secrets Manager references and never enter saved drafts or logs.
4. Choose network and HTTPS settings: VPC, private task subnets in two availability zones, public load-balancer subnets, and an ACM certificate for the domain. Region defaults to the selected profile's configured region. A missing region or certificate is an actionable incomplete state, not an invented default.
5. Review account, region, resource changes, intended access, expected ongoing costs where evidence exists, and automatic update settings. No fabricated cost estimate.
6. Deploy and observe real progress.

One Application Load Balancer spanning two availability zones is the default, with two Fargate tasks. The UI must not suggest two independent load balancers unless the backend actually provisions them. Public application access uses HTTPS. Application sign-in is a separate requirement from AWS operator sign-in: show its configuration distinctly, and never claim AWS operator login protects the deployed website.

### 3. Follow deployment and recovery

Show real stages: validate prerequisites, verify identity, build, publish immutable image, plan infrastructure, apply, wait for healthy targets, verify endpoint. Unsupported stages remain clearly unavailable. Stage results come from backend events, never timers.

The deployment detail view shows the source revision/image digest, selected AWS account and region, status, endpoint when verified, last update, health, and sanitized logs. Provide actionable errors for missing CLI/Docker, SSO expiry, insufficient permissions, certificate mismatch, invalid network selection, build failure, unhealthy tasks, and rollback.

Cancel stops local waiting or the active local build where supported; it does not imply that AWS has stopped an accepted CloudFormation operation. Explain the remaining remote operation and allow refresh/reconnect. Closing the app must not silently delete infrastructure. Destructive deletion is a separate explicit workflow.

### 4. Automatic updates

The target experience is commit-triggered builds, immutable image publication, rolling deployment, health verification, and automatic rollback of unhealthy releases. Cloud automation must continue while the desktop app is closed. Clearly distinguish automatic delivery from local polling. Until a repository pipeline is connected and verified, show automatic updates as not configured.

## Navigation and visual direction

Use a polished Material 3 desktop interface with an account/region selector, deployment overview, New deployment action, deployment details, Connections, Settings, and Help. Lead with tasks and meaningful empty states, not raw command forms or a file catalogue. Support light/dark themes, visible focus, accessible names, keyboard navigation, reduced motion, readable contrast, and narrow windows without clipped controls. Save user presentation settings locally.

Include contextual documentation, onboarding progress and recovery, and searchable settings. Broader product requirements such as personal wording import, per-search regex tooling, localization, and optional sound effects need real behavior and tests; do not add decorative controls or claim these complete from mockups. Keep imported personal wording local to the user and out of source, telemetry, logs, and exports.

## Desktop integration boundary

The renderer uses a narrowly scoped preload bridge, not raw IPC. The integration owner will expose account listing, connection, identity verification, prerequisite checks, validated deployment planning, deployment execution/status, cancellation, and subscription to sanitized progress. Treat these as capability requirements until the exact backend exports are integrated; do not independently invent a competing API.

The current backend module contract is `src/backend/index.js`: `createBackend({run?})` exposes `profiles(options)`, `profileRegion(profile, options)`, `identity({profile, region}, options)`, `login({profile, region}, options)`, `verifyDeployment(selection, expectedIdentity, options)`, and `prerequisites(options)`. Operations accept an `AbortSignal` and return `{ok: true, ...}` or `{ok: false, error: code}`. Identity results carry `accountId`, `arn`, `userId`, `profile`, and `region`. `login` succeeds only after browser sign-in and STS verification. These are backend functions, not permission to expose arbitrary function dispatch through IPC. Infrastructure execution and automatic pipeline integration remain pending.

Every long-running operation has an operation ID and an explicit terminal status. Events must stay scoped to the selected operation/account. Switching an account cannot silently retarget an operation already running. All renderer inputs are validated again in the main/backend process. External URLs are opened only after protocol and destination checks.

## Required design delivery and acceptance

Deliver annotated screens for onboarding, profile selection, AWS browser return, deployment wizard/review, running deployment, healthy deployment, failure/rollback, expired sign-in, and settings. Include empty, loading, error, disabled, cancellation, and recovery states, plus keyboard order and small-window behavior.

Submit a design-only pull request first so implementation ownership can be coordinated. If implementing the renderer, connect real bridge operations and test keyboard flows, account switching, failed/cancelled sign-in, draft restoration, progress isolation, and truthful unavailable states. Include inspected screenshots from the built app and label any prototype captures clearly. Keep all public source and records free of credentials, private instructions, or local account configuration.

## Outstanding external verification

Real AWS sign-in and deployment require a user-connected AWS profile, access portal/account role, network selection, and HTTPS domain/certificate. Those are not available in the development environment. Windows packaged-app execution must be verified on Windows. Record these limitations explicitly until actual evidence is available.
