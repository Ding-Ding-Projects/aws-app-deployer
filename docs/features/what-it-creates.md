# What a deployment creates

- A VPC across two availability zones
- A public Application Load Balancer
- One NAT gateway for outbound traffic
- Two Fargate tasks in private subnets
- An ECR repository holding an immutable image
- CloudWatch logs

These are billed by AWS until you delete them. Closing the app never deletes infrastructure.
