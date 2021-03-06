import { Construct } from 'constructs';
import {
  aws_route53 as route53,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elb,
  aws_certificatemanager as acm,
  aws_iam as iam,
  StackProps,
  Stack,
  CfnOutput,
  Duration,
  aws_efs as efs,
} from 'aws-cdk-lib';

import { ImportValues } from './import-values';

export interface CdkStackProps extends StackProps {
  maxAzs: number;
  appId: number;
  domain: string;
  dnsRecord: string;
  appName: string;
  instanceCount: number;
}
export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props: CdkStackProps) {
    super(scope, id, props);

    const get = new ImportValues(this, props);

    const fsSecurityGroup = new ec2.SecurityGroup(this, 'FsSecurityGroup', { vpc: get.vpc });
    fsSecurityGroup.connections.allowFrom(get.clusterSecurityGroup, ec2.Port.tcp(2049), `Allow traffic from ${get.appName} to the File System`);

    const subnets: ec2.Subnet[] = [];
    [...Array(props.maxAzs).keys()].forEach(azIndex => {
      const subnet = new ec2.PublicSubnet(this, `Subnet` + azIndex, {
        vpcId: get.vpc.vpcId,
        availabilityZone: Stack.of(this).availabilityZones[azIndex],
        cidrBlock: `10.0.${get.appId}.${(azIndex + 2) * 16}/28`,
        mapPublicIpOnLaunch: true,
      });
      new ec2.CfnRoute(this, 'PublicRouting' + azIndex, {
        destinationCidrBlock: '0.0.0.0/0',
        routeTableId: subnet.routeTable.routeTableId,
        gatewayId: get.igwId,
      });
      subnets.push(subnet);

      new efs.CfnMountTarget(this, 'MountTarget' + azIndex, {
        fileSystemId: get.fsId,
        securityGroups: [fsSecurityGroup.securityGroupId],
        subnetId: subnet.subnetId
      });
    });

    const fileSystem = efs.FileSystem.fromFileSystemAttributes(this, 'FileSystem', {
      securityGroup: fsSecurityGroup,
      fileSystemId: get.fsId,
    });

    const posixId = '0';
    const accessPoint1 = new efs.AccessPoint(this, 'ConfigAccessPoint', {
      fileSystem,
      createAcl: { ownerGid: posixId, ownerUid: posixId, permissions: "755" },
      path: '/files',
      posixUser: { uid: posixId, gid: posixId },
    });

    // ECS resources
    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDefinition', {
      networkMode: ecs.NetworkMode.BRIDGE,
      volumes: [{
        name: 'file-volume', efsVolumeConfiguration: {
          fileSystemId: get.fsId,
          transitEncryption: 'ENABLED',
          authorizationConfig: { accessPointId: accessPoint1.accessPointId, iam: 'ENABLED' },
        }
      },],
    });

    taskDefinition.addToTaskRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['elasticfilesystem:ClientMount', 'elasticfilesystem:ClientWrite'],
      resources: [get.fsArn],
    }));

    const container = taskDefinition.addContainer('Container', {
      image: ecs.ContainerImage.fromRegistry(get.dockerImage),
      containerName: `${get.appName}-container`,
      memoryReservationMiB: 32,
      portMappings: [{ containerPort: 80, hostPort: get.hostPort, protocol: ecs.Protocol.TCP }],
      logging: new ecs.AwsLogDriver({ streamPrefix: get.appName }),
    });
    container.addMountPoints(
      { containerPath: '/usr/local/apache2/htdocs', readOnly: false, sourceVolume: 'file-volume' },
    );

    const service = new ecs.Ec2Service(this, 'Service', {
      cluster: get.cluster,
      taskDefinition,
      desiredCount: get.instanceCount,
    });

    // Load balancer configuration
    get.clusterSecurityGroup.connections.allowFrom(get.albSecurityGroup, ec2.Port.tcp(get.hostPort), `Allow traffic from ELB for ${get.appName}`);

    const albTargetGroup = new elb.ApplicationTargetGroup(this, 'TargetGroup', {
      port: 80,
      protocol: elb.ApplicationProtocol.HTTP,
      vpc: get.vpc,
      targetType: elb.TargetType.INSTANCE,
      targets: [service],
      healthCheck: {
        enabled: true,
        interval: Duration.minutes(1),
        path: '/',
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
      },
    });

    new elb.ApplicationListenerRule(this, "ListenerRule", {
      listener: get.albListener,
      priority: get.priority,
      targetGroups: [albTargetGroup],
      conditions: [elb.ListenerCondition.hostHeaders([get.dnsName])],
    });

    const certificate = new acm.Certificate(this, 'SSL', {
      domainName: get.dnsName,
      validation: acm.CertificateValidation.fromDns(get.hostedZone),
    });
    get.albListener.addCertificates('AddCertificate', [certificate]);

    const record = new route53.CnameRecord(this, "AliasRecord", {
      zone: get.hostedZone,
      domainName: get.alb.loadBalancerDnsName,
      recordName: get.dnsRecord,
      ttl: Duration.hours(1),
    });

    new CfnOutput(this, 'DnsName', { value: record.domainName });
    new CfnOutput(this, 'EfsSecurityGroup', {
      value: fsSecurityGroup.securityGroupId,
      exportName: 'FileServer-EfsSecurityGroup'
    });
    new CfnOutput(this, 'EfsSubnetArn', {
      value: subnets[0].subnetId,
      exportName: 'FileServer-EfsSubnetId'
    });
  }
}
