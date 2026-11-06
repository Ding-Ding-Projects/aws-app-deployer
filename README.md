# AWS App Deployer

A local Windows desktop application for deploying containerized web applications to your own AWS account.

Connect an AWS IAM Identity Center profile through browser sign-in, choose a Dockerfile or a single-service Compose file, and press Deploy. The app builds and publishes the image, creates networking and an Application Load Balancer, runs two ECS Fargate tasks, waits for healthy targets, checks the public link, and hands it to you. Each Windows user keeps their own AWS profiles and credentials.

Landing page: https://ding-ding-projects.github.io/aws-app-deployer/ (source in [`site/`](site/)). Design: [`design/`](design/).

## Status

Early development. Every push to `main` runs the tests, builds a Windows installer, captures screenshots of that build on a Windows runner, and publishes a tagged release. Releases have passed automated tests only; no release has been verified against a live AWS account yet. See [ROADMAP.md](ROADMAP.md) for what is shipped, partial and not started.

## Run from source

```sh
npm ci
npm start          # launch the app
npm test           # backend, main-process and renderer tests
npm run dist:win   # build the Windows installer into dist/
```

`npm run screenshots` launches the app, saves a PNG of each main screen into `screenshots/`, and quits.

## What a deployment creates

A VPC across two availability zones, a public Application Load Balancer, one NAT gateway, two Fargate tasks in private subnets, an ECR repository with an immutable image, and CloudWatch logs. These are billed by AWS until you delete them. Closing the app never deletes infrastructure.

## Layout

| Path | Owner | Contents |
| --- | --- | --- |
| `src/backend/` | AWS implementation | Profiles, sign-in, identity, deployment orchestration |
| `src/main/` | Integration | Electron window, scoped bridge with operation IDs, dependency installer, settings store |
| `src/renderer/` | Design | The interface, built from `design/` |
| `site/` | Design | Landing page, deployed with GitHub Pages |
| `design/` | Design | Artboards, tokens, prototype renders, review record |

Read the [handoff](HANDOFF.md) for product flows, ownership and the integration contract. Do not include credentials, account-specific configuration, or private instructions in this repository.
