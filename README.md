# AWS App Deployer

A local desktop application for deploying containerized web applications to AWS.

## Intended workflow

Connect an AWS IAM Identity Center profile through browser sign-in, select a project, and deploy it to ECS Fargate behind an HTTPS Application Load Balancer. Each local user keeps their own AWS profiles and credentials. Deployment status, health checks, updates, and rollback are shown in the application.

## Development status

Initial implementation is in progress. No deployable release or live AWS verification is available yet.

Read the [designer handoff](HANDOFF.md) for the complete product flows, ownership boundaries, and integration contract.

## Parallel design work

Design proposals and handoffs belong in `design/`. The desktop interface belongs in `src/renderer/`; AWS operations belong in `src/backend/`. Coordinate the preload API before integrating UI work. Do not include credentials, account-specific configuration, or private instructions in this repository.
