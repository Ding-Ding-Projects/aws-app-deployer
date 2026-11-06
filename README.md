# AWS App Deployer

A local desktop application for deploying containerized web applications to AWS.

## Intended workflow

Connect an AWS IAM Identity Center profile through browser sign-in, select a Dockerfile or Docker Compose project, and click Deploy. The intended workflow builds and publishes the container images, creates AWS networking and an Application Load Balancer, deploys to ECS Fargate, verifies health, and returns a public URL anyone can open. The default is an AWS-generated HTTP URL; a custom domain with HTTPS is optional.

Each local user keeps their own AWS profiles and credentials. Supported failures should be retried or repaired automatically with bounded recovery and truthful blockers. Full multi-service Compose deployment and universal error repair are not implemented.

## Development status

Initial implementation is in progress. No deployable release or live AWS verification is available yet.

Read the [designer handoff](HANDOFF.md) for the complete product flows, ownership boundaries, and integration contract.

## Parallel design work

Design proposals and handoffs belong in `design/`. The desktop interface belongs in `src/renderer/`; AWS operations belong in `src/backend/`. Coordinate the preload API before integrating UI work. Do not include credentials, account-specific configuration, or private instructions in this repository.
