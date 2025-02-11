import {
  CreateVolumeCommandOutput,
  EC2Client,
  Tag,
  paginateDescribeVolumes,
  paginateDescribeInstances,
} from '@aws-sdk/client-ec2';
import { makeResourceTags, paginateAwsCall } from '../lib/common.js';
import { InstrumentedResource, ToolingInterface } from './instrumentedResource.js';
import { DriverInterface } from './driverInterface.js';
import { RevolverAction, RevolverActionWithTags } from '../actions/actions.js';
import { ec2Tagger } from './tags.js';
import { getAwsClientForAccount } from '../lib/awsConfig.js';
import dateTime from '../lib/dateTime.js';

class InstrumentedEBS extends ToolingInterface {
  private volumeARN: string;

  constructor(resource: CreateVolumeCommandOutput, volumeARN: string) {
    super(resource);
    this.volumeARN = volumeARN;
  }

  get resourceId() {
    return this.resource.VolumeId;
  }

  get resourceType() {
    return 'ebs';
  }

  get resourceArn() {
    return this.volumeARN;
  }

  get resourceState() {
    return this.resource.State;
  }

  get launchTimeUtc() {
    return dateTime.getUtcDateTime(this.resource.LaunchTime);
  }

  tag(key: string) {
    const tag = (this.resource.Tags || []).find((xt: Tag) => xt.Key === key);
    if (tag !== undefined) {
      return tag.Value;
    }
  }
  get resourceTags(): { [key: string]: string } {
    return makeResourceTags(this.resource.Tags);
  }
}

class EBSDriver extends DriverInterface {
  stop() {
    this.logger.debug("An EBS volume can't be stopped directly, ignoring action");
    return Promise.resolve();
  }

  maskstop(resource: InstrumentedEBS) {
    return `EBS volume ${resource.resourceId} can't be stopped`;
  }

  start() {
    this.logger.debug("An EBS volume can't be started directly, ignoring action");
    return Promise.resolve();
  }

  maskstart(resource: InstrumentedEBS) {
    return `EBS volume ${resource.resourceId} can't be started`;
  }

  async setTag(resources: InstrumentedEBS[], action: RevolverActionWithTags) {
    const ec2 = await getAwsClientForAccount(EC2Client, this.accountConfig);
    return ec2Tagger.setTag(ec2, this.logger, resources, action);
  }

  masksetTag(resource: InstrumentedEBS, action: RevolverActionWithTags) {
    return ec2Tagger.masksetTag(resource, action);
  }

  async unsetTag(resources: InstrumentedEBS[], action: RevolverActionWithTags) {
    const ec2 = await getAwsClientForAccount(EC2Client, this.accountConfig);
    return ec2Tagger.unsetTag(ec2, this.logger, resources, action);
  }

  maskunsetTag(resource: InstrumentedEBS, action: RevolverActionWithTags) {
    return ec2Tagger.maskunsetTag(resource, action);
  }

  noop(resources: InstrumentedEBS[], action: RevolverAction) {
    this.logger.info(`EBS volumes ${resources.map((xr) => xr.resourceId)} will noop because: ${action.reason}`);
    return Promise.resolve();
  }

  async collect() {
    const logger = this.logger;
    logger.debug(`EBS module collecting account: ${this.accountConfig.name}`);

    const ec2 = await getAwsClientForAccount(EC2Client, this.accountConfig);

    const ebsVolumes = await paginateAwsCall(paginateDescribeVolumes, ec2, 'Volumes');
    const ec2instances = (await paginateAwsCall(paginateDescribeInstances, ec2, 'Reservations')).flatMap(
      (xr) => xr.Instances,
    );

    logger.debug(`Found ${ebsVolumes.length} ebs volumes`);

    for (const volume of ebsVolumes) {
      if (volume.State === 'in-use') {
        const instanceId = volume.Attachments[0].InstanceId;
        volume.instanceDetails = ec2instances.find((xi) => xi.InstanceId === instanceId);
      }
    }

    return ebsVolumes.map(
      (xe) =>
        new InstrumentedEBS(xe, `arn:aws:ec2:${this.accountConfig.region}:${this.accountId}:volume/${xe.VolumeId}`),
    );
  }
  resource(obj: InstrumentedResource): ToolingInterface {
    return new InstrumentedEBS(obj.resource, obj.resourceArn);
  }
}

export default EBSDriver;
