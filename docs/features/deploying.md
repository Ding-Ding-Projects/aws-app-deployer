# Deploying

Press **New deployment**.

1. Account: the verified account and region.
2. Source: choose a `Dockerfile` or a `compose.yaml`. The app inspects it and lists anything it cannot deploy yet before creating anything.
3. Configure: application name, container port, health check path and plain environment values. Task size is fixed at 0.25 vCPU and 512 MiB.
4. Review and **Deploy**.

Progress comes from the backend, stage by stage. The link appears only after AWS reports healthy targets and the link answers. If a release fails its health checks, ECS rolls back and the previous version keeps serving.
