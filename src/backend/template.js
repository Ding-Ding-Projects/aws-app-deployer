'use strict';
function buildTemplate(input) {
  const { name, region, accountId, certificateArn, vpcId, publicSubnets, privateSubnets, image, containerPort = 3000 } = input || {};
  const subnets = a => Array.isArray(a) && a.length >= 2 && a.every(x => /^subnet-[0-9a-f]{8,17}$/.test(x)) && new Set(a).size === a.length;
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(name || '') || !/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(region || '') || !/^\d{12}$/.test(accountId || '') || !/^vpc-[0-9a-f]{8,17}$/.test(vpcId || '') || !subnets(publicSubnets) || !subnets(privateSubnets) || !Number.isInteger(containerPort) || containerPort < 1 || containerPort > 65535) return { ok: false, error: 'INVALID_INPUT' };
  const partition = region.startsWith('cn-') ? 'aws-cn' : region.startsWith('us-gov-') ? 'aws-us-gov' : 'aws';
  const suffix = partition === 'aws-cn' ? 'amazonaws.com.cn' : 'amazonaws.com';
  const repository = `${accountId}.dkr.ecr.${region}.${suffix}/`;
  if (typeof image !== 'string' || !image.startsWith(repository) || !/^[a-z0-9][a-z0-9/_.-]*@sha256:[a-f0-9]{64}$/.test(image.slice(repository.length)) || typeof certificateArn !== 'string' || !certificateArn.startsWith(`arn:${partition}:acm:${region}:${accountId}:certificate/`) || !/certificate\/[a-f0-9-]{36}$/.test(certificateArn)) return { ok: false, error: 'INVALID_INPUT' };
  const ref = name => ({ Ref: name });
  const attr = (name, key) => ({ 'Fn::GetAtt': [name, key] });
  const resource = (Type, Properties) => ({ Type, Properties });
  const trust = { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: ['ecs-tasks.amazonaws.com'] }, Action: ['sts:AssumeRole'] }] };
  const logArn = `arn:${partition}:logs:${region}:${accountId}:log-group:/ecs/${name}:*`;
  const repoName = image.slice(repository.length).split('@')[0];
  const Resources = {
    Cluster: resource('AWS::ECS::Cluster', {}),
    Logs: { ...resource('AWS::Logs::LogGroup', { LogGroupName: `/ecs/${name}`, RetentionInDays: 30 }), DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' },
    ExecutionRole: resource('AWS::IAM::Role', { AssumeRolePolicyDocument: trust, Policies: [{ PolicyName: 'PullImageAndWriteLogs', PolicyDocument: { Version: '2012-10-17', Statement: [
      { Effect: 'Allow', Action: ['ecr:GetAuthorizationToken'], Resource: '*' },
      { Effect: 'Allow', Action: ['ecr:BatchCheckLayerAvailability', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage'], Resource: `arn:${partition}:ecr:${region}:${accountId}:repository/${repoName}` },
      { Effect: 'Allow', Action: ['logs:CreateLogStream', 'logs:PutLogEvents'], Resource: logArn },
    ] } }] }),
    TaskRole: resource('AWS::IAM::Role', { AssumeRolePolicyDocument: trust }),
    LoadBalancerSecurityGroup: resource('AWS::EC2::SecurityGroup', { GroupDescription: 'Public HTTPS ingress', VpcId: vpcId, SecurityGroupIngress: [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, CidrIp: '0.0.0.0/0' }] }),
    TaskSecurityGroup: resource('AWS::EC2::SecurityGroup', { GroupDescription: 'Application ingress from load balancer', VpcId: vpcId, SecurityGroupIngress: [{ IpProtocol: 'tcp', FromPort: containerPort, ToPort: containerPort, SourceSecurityGroupId: ref('LoadBalancerSecurityGroup') }] }),
    LoadBalancer: resource('AWS::ElasticLoadBalancingV2::LoadBalancer', { Scheme: 'internet-facing', Type: 'application', Subnets: publicSubnets, SecurityGroups: [ref('LoadBalancerSecurityGroup')] }),
    TargetGroup: resource('AWS::ElasticLoadBalancingV2::TargetGroup', { VpcId: vpcId, Protocol: 'HTTP', Port: containerPort, TargetType: 'ip', HealthCheckPath: '/', Matcher: { HttpCode: '200-399' } }),
    Listener: resource('AWS::ElasticLoadBalancingV2::Listener', { LoadBalancerArn: ref('LoadBalancer'), Port: 443, Protocol: 'HTTPS', SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06', Certificates: [{ CertificateArn: certificateArn }], DefaultActions: [{ Type: 'forward', TargetGroupArn: ref('TargetGroup') }] }),
    Task: resource('AWS::ECS::TaskDefinition', { Cpu: '256', Memory: '512', NetworkMode: 'awsvpc', RequiresCompatibilities: ['FARGATE'], ExecutionRoleArn: attr('ExecutionRole', 'Arn'), TaskRoleArn: attr('TaskRole', 'Arn'), ContainerDefinitions: [{ Name: 'app', Image: image, Essential: true, PortMappings: [{ ContainerPort: containerPort }], LogConfiguration: { LogDriver: 'awslogs', Options: { 'awslogs-group': ref('Logs'), 'awslogs-region': region, 'awslogs-stream-prefix': 'app' } } }] }),
    Service: { ...resource('AWS::ECS::Service', { Cluster: ref('Cluster'), TaskDefinition: ref('Task'), DesiredCount: 2, LaunchType: 'FARGATE', DeploymentConfiguration: { DeploymentCircuitBreaker: { Enable: true, Rollback: true }, MinimumHealthyPercent: 100, MaximumPercent: 200 }, NetworkConfiguration: { AwsvpcConfiguration: { AssignPublicIp: 'DISABLED', Subnets: privateSubnets, SecurityGroups: [ref('TaskSecurityGroup')] } }, LoadBalancers: [{ ContainerName: 'app', ContainerPort: containerPort, TargetGroupArn: ref('TargetGroup') }] }), DependsOn: ['Listener'] },
  };
  return { ok: true, template: { AWSTemplateFormatVersion: '2010-09-09', Description: 'HTTPS application on ECS Fargate; private subnets require outbound access to ECR and CloudWatch Logs.', Resources, Outputs: { LoadBalancerDnsName: { Value: attr('LoadBalancer', 'DNSName') } } } };
}
module.exports = { buildTemplate };
