'use strict';
function buildTemplate(input) {
  const { name, region, accountId, certificateArn, domain, image, containerPort = 3000, environment = {}, healthCheckPath = '/' } = input || {};
  let { vpcId, publicSubnets, privateSubnets } = input || {};
  const existingNetwork = vpcId !== undefined || publicSubnets !== undefined || privateSubnets !== undefined;
  const subnets = a => Array.isArray(a) && a.length >= 2 && a.every(x => /^subnet-[0-9a-f]{8,17}$/.test(x)) && new Set(a).size === a.length;
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(name || '') || !/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(region || '') || !/^\d{12}$/.test(accountId || '') || (existingNetwork && (!/^vpc-[0-9a-f]{8,17}$/.test(vpcId || '') || !subnets(publicSubnets) || !subnets(privateSubnets) || publicSubnets.some(x => privateSubnets.includes(x)))) || !Number.isInteger(containerPort) || containerPort < 1 || containerPort > 65535) return { ok: false, error: 'INVALID_INPUT' };
  const partition = region.startsWith('cn-') ? 'aws-cn' : region.startsWith('us-gov-') ? 'aws-us-gov' : 'aws';
  const suffix = partition === 'aws-cn' ? 'amazonaws.com.cn' : 'amazonaws.com';
  const repository = `${accountId}.dkr.ecr.${region}.${suffix}/`;
  if (typeof image !== 'string' || !image.startsWith(repository) || !/^[a-z0-9][a-z0-9/_.-]*@sha256:[a-f0-9]{64}$/.test(image.slice(repository.length))) return { ok: false, error: 'INVALID_INPUT' };
  if ((certificateArn || domain) && (typeof certificateArn !== 'string' || !certificateArn.startsWith(`arn:${partition}:acm:${region}:${accountId}:certificate/`) || !/certificate\/[a-f0-9-]{36}$/.test(certificateArn) || typeof domain !== 'string' || domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))) return { ok: false, error: 'INVALID_INPUT' };
  if (!environment || typeof environment !== 'object' || Array.isArray(environment) || Object.entries(environment).some(([k, v]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || typeof v !== 'string') || typeof healthCheckPath !== 'string' || !/^\/[^\s#]*$/.test(healthCheckPath) || healthCheckPath.length > 1024) return { ok: false, error: 'INVALID_INPUT' };
  const ref = name => ({ Ref: name });
  const attr = (name, key) => ({ 'Fn::GetAtt': [name, key] });
  const resource = (Type, Properties) => ({ Type, Properties });
  const trust = { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: ['ecs-tasks.amazonaws.com'] }, Action: ['sts:AssumeRole'] }] };
  const network = {};
  if (!existingNetwork) {
    vpcId = ref('Vpc'); publicSubnets = [ref('PublicSubnetA'), ref('PublicSubnetB')]; privateSubnets = [ref('PrivateSubnetA'), ref('PrivateSubnetB')];
    network.Vpc = resource('AWS::EC2::VPC', { CidrBlock: '10.42.0.0/16', EnableDnsHostnames: true, EnableDnsSupport: true });
    network.InternetGateway = resource('AWS::EC2::InternetGateway', {});
    network.GatewayAttachment = resource('AWS::EC2::VPCGatewayAttachment', { VpcId: vpcId, InternetGatewayId: ref('InternetGateway') });
    network.PublicRouteTable = resource('AWS::EC2::RouteTable', { VpcId: vpcId });
    network.PublicDefaultRoute = { ...resource('AWS::EC2::Route', { RouteTableId: ref('PublicRouteTable'), DestinationCidrBlock: '0.0.0.0/0', GatewayId: ref('InternetGateway') }), DependsOn: ['GatewayAttachment'] };
    network.NatAddress = { ...resource('AWS::EC2::EIP', { Domain: 'vpc' }), DependsOn: ['GatewayAttachment'] };
    network.NatGateway = resource('AWS::EC2::NatGateway', { AllocationId: attr('NatAddress', 'AllocationId'), SubnetId: ref('PublicSubnetA') });
    network.PrivateRouteTable = resource('AWS::EC2::RouteTable', { VpcId: vpcId });
    network.PrivateDefaultRoute = resource('AWS::EC2::Route', { RouteTableId: ref('PrivateRouteTable'), DestinationCidrBlock: '0.0.0.0/0', NatGatewayId: ref('NatGateway') });
    for (const [index, zone] of ['A', 'B'].entries()) {
      for (const [kind, cidr] of [['Public', `10.42.${index}.0/24`], ['Private', `10.42.${index + 10}.0/24`]]) {
        network[`${kind}Subnet${zone}`] = resource('AWS::EC2::Subnet', { VpcId: vpcId, CidrBlock: cidr, AvailabilityZone: { 'Fn::Select': [index, { 'Fn::GetAZs': '' }] }, MapPublicIpOnLaunch: false });
        network[`${kind}Association${zone}`] = resource('AWS::EC2::SubnetRouteTableAssociation', { SubnetId: ref(`${kind}Subnet${zone}`), RouteTableId: ref(`${kind}RouteTable`) });
      }
    }
  }
  const logArn = `arn:${partition}:logs:${region}:${accountId}:log-group:/ecs/${name}:*`;
  const repoName = image.slice(repository.length).split('@')[0];
  const Resources = {
    ...network,
    Cluster: resource('AWS::ECS::Cluster', {}),
    Logs: { ...resource('AWS::Logs::LogGroup', { LogGroupName: `/ecs/${name}`, RetentionInDays: 30 }), DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' },
    ExecutionRole: resource('AWS::IAM::Role', { AssumeRolePolicyDocument: trust, Policies: [{ PolicyName: 'PullImageAndWriteLogs', PolicyDocument: { Version: '2012-10-17', Statement: [
      { Effect: 'Allow', Action: ['ecr:GetAuthorizationToken'], Resource: '*' },
      { Effect: 'Allow', Action: ['ecr:BatchCheckLayerAvailability', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage'], Resource: `arn:${partition}:ecr:${region}:${accountId}:repository/${repoName}` },
      { Effect: 'Allow', Action: ['logs:CreateLogStream', 'logs:PutLogEvents'], Resource: logArn },
    ] } }] }),
    TaskRole: resource('AWS::IAM::Role', { AssumeRolePolicyDocument: trust }),
    LoadBalancerSecurityGroup: resource('AWS::EC2::SecurityGroup', { GroupDescription: 'Public application ingress', VpcId: vpcId, SecurityGroupIngress: [{ IpProtocol: 'tcp', FromPort: certificateArn ? 443 : 80, ToPort: certificateArn ? 443 : 80, CidrIp: '0.0.0.0/0' }] }),
    TaskSecurityGroup: resource('AWS::EC2::SecurityGroup', { GroupDescription: 'Application ingress from load balancer', VpcId: vpcId, SecurityGroupIngress: [{ IpProtocol: 'tcp', FromPort: containerPort, ToPort: containerPort, SourceSecurityGroupId: ref('LoadBalancerSecurityGroup') }] }),
    LoadBalancer: { ...resource('AWS::ElasticLoadBalancingV2::LoadBalancer', { Scheme: 'internet-facing', Type: 'application', Subnets: publicSubnets, SecurityGroups: [ref('LoadBalancerSecurityGroup')] }), ...(!existingNetwork ? { DependsOn: ['GatewayAttachment', 'PublicDefaultRoute'] } : {}) },
    TargetGroup: resource('AWS::ElasticLoadBalancingV2::TargetGroup', { VpcId: vpcId, Protocol: 'HTTP', Port: containerPort, TargetType: 'ip', HealthCheckPath: healthCheckPath, Matcher: { HttpCode: '200-399' } }),
    Listener: resource('AWS::ElasticLoadBalancingV2::Listener', { LoadBalancerArn: ref('LoadBalancer'), Port: certificateArn ? 443 : 80, Protocol: certificateArn ? 'HTTPS' : 'HTTP', ...(certificateArn ? { SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06', Certificates: [{ CertificateArn: certificateArn }] } : {}), DefaultActions: [{ Type: 'forward', TargetGroupArn: ref('TargetGroup') }] }),
    Task: resource('AWS::ECS::TaskDefinition', { Cpu: '256', Memory: '512', NetworkMode: 'awsvpc', RequiresCompatibilities: ['FARGATE'], ExecutionRoleArn: attr('ExecutionRole', 'Arn'), TaskRoleArn: attr('TaskRole', 'Arn'), ContainerDefinitions: [{ Name: 'app', Image: image, Essential: true, Environment: Object.entries(environment).map(([Name, Value]) => ({ Name, Value })), PortMappings: [{ ContainerPort: containerPort }], LogConfiguration: { LogDriver: 'awslogs', Options: { 'awslogs-group': ref('Logs'), 'awslogs-region': region, 'awslogs-stream-prefix': 'app' } } }] }),
    Service: { ...resource('AWS::ECS::Service', { Cluster: ref('Cluster'), TaskDefinition: ref('Task'), DesiredCount: 2, LaunchType: 'FARGATE', DeploymentConfiguration: { DeploymentCircuitBreaker: { Enable: true, Rollback: true }, MinimumHealthyPercent: 100, MaximumPercent: 200 }, NetworkConfiguration: { AwsvpcConfiguration: { AssignPublicIp: 'DISABLED', Subnets: privateSubnets, SecurityGroups: [ref('TaskSecurityGroup')] } }, LoadBalancers: [{ ContainerName: 'app', ContainerPort: containerPort, TargetGroupArn: ref('TargetGroup') }] }), DependsOn: ['Listener', ...(!existingNetwork ? ['PrivateDefaultRoute', 'PublicDefaultRoute', 'PublicAssociationA', 'PublicAssociationB', 'PrivateAssociationA', 'PrivateAssociationB'] : [])] },
  };
  return { ok: true, template: { AWSTemplateFormatVersion: '2010-09-09', Description: 'Application on ECS Fargate; private subnets require outbound access to ECR and CloudWatch Logs.', Resources, Outputs: { LoadBalancerDnsName: { Value: attr('LoadBalancer', 'DNSName') }, TargetGroupArn: { Value: ref('TargetGroup') }, ClusterName: { Value: ref('Cluster') }, ServiceName: { Value: attr('Service', 'Name') } } } };
}
module.exports = { buildTemplate };
