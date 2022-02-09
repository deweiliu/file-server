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
  aws_s3 as s3,
  CfnOutput,
  Duration,
  aws_efs as efs,
} from 'aws-cdk-lib';

import { ImportValues } from './import-values';
import { S3 } from 'aws-cdk-lib/aws-ses-actions';

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

    new s3.Bucket(this, 'SyncBucket', { bucketName: 'file-server-sync-bucket' });

  }
}
