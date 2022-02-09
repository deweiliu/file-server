import { Construct } from 'constructs';
import { aws_ec2 as ec2, Fn, Stack } from 'aws-cdk-lib';

import { CdkStackProps } from './main-stack';
export class ImportValues extends Construct implements CdkStackProps {
    public vpc: ec2.IVpc;
    public appName: string;
    public fsArn: string;
    public efsSecurityGroup: string;
    public efsSubnetId: string;

    constructor(scope: Construct, props: CdkStackProps) {
        super(scope, 'ImportValues')

        this.appName = props.appName;
        this.vpc = ec2.Vpc.fromVpcAttributes(scope, 'ALBVPC', {
            vpcId: Fn.importValue('Core-Vpc'),
            availabilityZones: Stack.of(this).availabilityZones,
        });

        this.fsArn = Fn.importValue('FileServer-EfsArn');
        this.efsSecurityGroup = Fn.importValue('FileServer-EfsSecurityGroup');
        this.efsSubnetId = Fn.importValue('FileServer-EfsSubnetId');
    }
}