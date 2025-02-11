Revolver, an AWS powercycle facility and more
======

Why
------

Shutting AWS resources down when they are not in use is the first cost-saving exercise you should be thinking of.

The most commonly used pattern is tagging your resources with some sort of schedule and having a script run regularly parsing the tags and powercycling the resources.

Revolver does exactly that.

Revolver:

* is run in AWS Lambda, send log in Cloudwatch Logs
* is controlled by a YAML config file in S3 and a handful of environment variables
* supports IAM cross-account access, so you can use one Lambda function to control multiple accounts
* is fully asynchronous, which gives it a better performance
* has a responsibilty separation between drivers that directly operate the resources and plugins that work out what needs to be done with a resource, which gives Revolver an amazing extensibility potential

Apart from powercycling resources Revolver can validate that required tags are set on AWS resources and their values match a regular expression.

What
------

Revolver currently supports the following AWS resources:

* EC2 instances including those run in Autoscaling, Revolver will pause the ASG prior to shutting down instances
* EBS volumes. Revolver will tag these resources. Revolver can get the tags from the parent instance/volume.
* Snapshots. Revolver will tag these resources. Revolver can get the tags from the parent instance/volume.
* RDS single instances, Revolver will use the native start/stop feature
* RDS multi-az instances, Revolver will use the native start/stop feature
* RDS Clusters, Revolver will use the native start/stop feature

Revolver does not support RDS instances with read replicas, as it is very difficult to ensure integrity for such configurations

How
------

### Deploy

Revolver is packaged as an AWS Lambda function and is triggered by a Cloudwatch Event.

This repository only contains the Revolver code and no deployment mechanisms. To prepare it for deploying you should use `npm run build` and `npm run bundle` commands to build the code and create a zip file.
suitable for deployment in AWS Lambda.

You are free to choose your own deployment mechanism. We use [CDK](https://docs.aws.amazon.com/cdk/latest/guide/home.html) to deploy Revolver.

### Configure

Revolver reads some of the low-level configuration from environment variables and the rest from a YAML file in S3.

#### Environment variables

|Variable|Description|Default|
|-|-|-|
|S3_BUCKET|S3 bucket where the config file is stored|-|
|S3_KEY|S3 key of the config file|-|
|LOG_LEVEL|Log level|debug|
|LOG_FORMAT|Log format|pretty|
|STYLE_PRETTY_LOGS|Defines whether logs should be styled and colorized|true|
|PRETTY_LOG_TIME_ZONE|Set timezone of pretty log messages to either UTC (default) or local (based on your server/browser configuration)|-|

In addition to that you can use:

* `CONFIG_FILE` to run Revolver with a local config file instead of the one in S3, this is implemented for debugging purposes
* `SDK_BASE_BACKOFF` and `SDK_MAX_RETRIES` to control the AWS SDK retry behavior, see [AWS SDK documentation](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property) for details

#### Config file

Main Revolver configuration is done in YAML. First line in the config file must be `---` as per YAML specification.

1. Section `defaults` defines default behavior for all accounts. Settings in this section can be overriden in the accounts section


  | Option name          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Default  |
  |----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|
  | region               | Specifies the default AWS region                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | -        |
  | timezone             | Specifies the default time zone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | utc      |
  | timezoneTag          | Revolver will read this tag on individual resources to override account-wide timezone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Timezone |
  | organizationRoleName | Role to be assumed on the main account from organizations to get the accounts list from it. Set to `none` to disable for offline testing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | -        |
  | revolverRoleName     | Revolver role name to be assumed on each client account. Set to `none` to disable for offline testing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | -        |
  | resourceLog          | Output discovered resources to file or console. Accepts a map of enabled resource log types. <br/>>`json` requires a field `file` and will write a complete JSON of all discovered resources with all fields. <br/>>`csv` requires field `file` and will write a CSV of discovered resources with a much smaller field set. <br/>>`console` will write output similar to the CSV but in the logger. <br/>Both `csv` and `console` support the optional field `reportTags` as an array of resource tags to report in the output<br/>>`sqs` requires a `url` field and an optional `attributes` map of `string:string` and will write the message to an SQS queue with message attributes set as specifeid. | -        |
  | auditLog             | Configure an audit log of actions performed on resources. `auditLog` accepts a map of enabled audit types. These include <br/>> `console` to print a log to the logger, no configuration accepted<br>> `csv` to write an audit log to a csv. Configuration for `csv` requires `file` field specifying the output file and an optional boolean `append` field to instead append to the file rather than overwriting. <br/>>`sqs` requires a `url` field and an optional `attributes` map of `string:string` and will write the message to an SQS queue with message attributes set as specifeid.                                                                                                           | -        |
  | localResourcesFile   | Read resources from a JSON file generated by `resourceLog.json`. Good for offline testing of configuration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | -        |
  | excludeResources     | Filter to match resources that should be completely excluded from processing (see [Filter](#####Filter)])                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | -        |
  | includeResourceTags  | List of AWS Tags from resources to be included in the audit log output. Defaults to all tags.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | -        |
  | drivers              | List of enabled drivers and their options (see Drivers)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | -        |
  | plugins              | List of enabled plugins with their options (see Plugins)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | -        |

Note: if any of the `file` elements in `resourceLog` or `auditLog` contain tokens of the format: `%xxxx` these may be replaced by context-sensitive values. At least:
- `%name` the "name" of the current account, from the config YAML
- `%accountId`
- `%region`
- `%timezone`
- Any of the date/time values from https://moment.github.io/luxon/#/formatting?id=table-of-tokens

In this way, output files can be named uniquely based on the current datetime.  For example:
```yaml
      csv:
        file: 'resources.%name.%accountId.%yyyy%LL%dd.json'
```


Example `defaults` section:

    ```yaml
    defaults:
      region: ap-southeast-2
      timezone: Australia/Melbourne
      timezoneTag: Timezone
      organizationRoleNme: AWSOrganizationsReadOnly
      revolverRoleName: ssPowerCycle
      resourceLog:
        json:
          file: resources.json
        console:
          reportTags: ["Name", "Schedule"]
        csv:
          file: resources.csv
          reportTags: ["Name", "Schedule"]
      auditLog:
        console:
        csv:
          file: "audit.csv"
          append: true
        json:
          sqs:
            url: "https://sqs.ap-southeast-2.amazonaws.com/123456789012/sqs-queue"
            attributes:
              costCenter: "1234"
              recordId: "0000001"
      includeResourceTags:
        - asset-id
        - billing-code
      drivers:
        - name: ec2
          active: true
          pretend: false
        - name: rdsInstance
          active: true
          pretend: false
        - name: rdsCluster
          active: true
          pretend: false
    ```

2. Section `organizations` specifies per-organization options overriding the defaults from the `defaults section`. You can override default settings on a per-organization basis, including *region*. You can also specify a list of drivers to be used for each organization.

    Leave as empty array if not being used

    ```yaml
    organizations: []
    ```

    Example organization configuration:

    ```yaml
    organizations:
      - account_id: "000000000000"
        accountNameRegex: "-nonprod$"
        settings:
          name: Innablr
          revolver_role_name: ssPowerCycle
          organization_role_name: AWSOrganizationsReadOnly
        drivers:
          - name: ec2
            pretend: false
    ```

    Optional `accountNameRegex` is a regular expression which acts as a filter against all of the accounts in this organization.  The example above limits the list of accounts discovered to those ending in "-nonprod".

3. Section `accounts` have two lists:
    * in the `include_list` you can specify a list of accounts to be included in the run. If AWS Organisation is configured, these accounts will be added to the list of accounts from the organization. If AWS Organisation is not configured, only these accounts will be processed.
    * accounts specified in the `exclude_list` will be excluded from processing, this takes the highest priority.

    Under every account in the `include_list` you can specify account-specific settings, drivers and plugins. These settings will override the defaults from the `defaults` section.

    Example account configuration:

    ```yaml
    accounts:
      include_list:
        - account_id: "000000000000"
          settings:
            name: radix-dev
            timezone: Australia/Melbourne
          plugins:
            - name: powercycle
              tagging: strict
              availabilityTag: Schedule
            - name: validateTags
              tag: CostCentre
      exclude_list:
        - account_id: "111111111111"
          settings:
            name: helix-dev
            timezone: Europe/Dublin
            timezoneTag: TZ
          plugins:
            powercycle:
              active: true
              configs:
                - tagging: strict
                  availabilityTag: Schedule
            validateTags:
              active: true
              configs:
                -
                  tag: Name
                  tagMissing:
                    - warn
    ```

    Supported options are the same as `defaults`

### Drivers

Drivers define how to operate a particular type of AWS resource, how to stop or start it or set a tag.

`drivers` section in the config file is a list of dicts, every dict represents an instance of a driver. Attribute `name` is the name of the driver.

All drivers support the following options:

|Option|Description|Allowed values|Default|
|-|-|-|-|
|active|Whether the driver is active|`true` or `false`|`true`|
|pretend|Prevents the driver from actually performing the actions. Good for debugging|`true` or `false`|`true`|

Supported drivers:

|Driver|Description|
|-|-|
|ec2|AWS EC2 instances and autoscaling groups|
|ebs|EBS volumes|
|snapshot|EBS snapshots|
|rdsInstance|RDS instances|
|rdsCluster|RDS Aurora clusters|

### Plugins

Plugins define what needs to be done on AWS resources. Some plugins support only some types of AWS resources but not the others.

For every AWS resource plugins will be executed in the order they are listed in the config file. Plugins that run earlier will have the priority on the state-changing actions. For example if `validateTags` wants to shut an EC2 instance down and at the same time the `powercycle` plugin wants to start it, the plugin that is listed first wins.

`plugins` section in the config file is a dict where keys are plugin names. Every plugin can have a list of configs, every config is a dict with plugin-specific options.

#### powercycle plugin

Starts AWS resources in the worktime and stops them after hours based on their tagging. Supports pluggable tagging formats.

|Option|Description|Allowed values|Default|
|-|-|-|-|
|tagging|Defines tagging format. See below|`strict`|`strict`|
|availabilityTag|Name of the tag that contains the schedule|AWS tag name|Schedule|

When an operation is performed on a resource a tag with a name `ReasonSchedule` (Schedule is replaced with the actual name of the schedule tag) will be set explaining the reason.

When the schedule tag is missing or unreadable a tag with a name `WarningSchedule` (Schedule is replaced with the actual name of the schedule tag) will be set with a warning text.

Powercycle respects the account-wide timezone specification as well as individual timezone tags on resources (see `defaults` and `accounts`).

```yaml
plugins:
  powercycle:
    active: true
    configs:
      - tagging: strict
        availabilityTag: Schedule
```

Powercycle plugin supports the following tagging standards:

##### strict

Schedule is set as a string like `Start=8:00|mon-fri;Stop=16:30|mon-fri;Override=Off`. Start= specifies the startup time, Stop= is the stop time, both in 24h format.

Days are separated by the pipe symbol, must be a full range (`mon` or `-fri` is not supported) and can be either appended to Start or Stop but only the first seen definition will be used (`Start=x|mon-fri;Stop=y|tue-thu` will result in `mon-fri`).

If Start= or Stop= is omitted, the resource will be only brought up or down within 15 min range of the specified time. Useful for making sure that resources are always shut down in the end of the day but only brought up on-demand: `Stop=18:00|mon-fri`.

`Override=On/Off` is optional, if set to `Override=On` resource will be ignored by the plugin.

There is also special values for the schedule tag:

* `24x7` - resource will be always up. If you stop it manually Revolver will attempt to bring it up
* `24x5` - resource will be always up except for Saturday and Sunday
* `0x7` - resource will be always down. If you manually start it Revolver will bring it down

For RDS `|` and `;` must be replaces with `_` and '/' respectively as RDS does not support these characters in tags: `Start=08:00_mon-sat/Stop=17:55/Override=off`.

#### validateTags plugin

This plugin will validate that a certain tag exist on AWS resources and optionally match the provided regular expression. If the tag is missing or does not match, the resource can be optionally shut down or set a warning tag or set the tag with a specified default value, or any combination of these actions.

|Option|Description|Allowed values|Default|
|-|-|-|-|
|tag|Name of the tag to validate|AWS tag name| - |
|match|JS-compatible regular expression to match the value against (optional)|JS regex| - |
|tagMissing|List of actions to perform on the resource if the tag is missing|`warn`,`stop`,`copyFromParent`,`setDefault`| - |
|tagNotMatch|List of actions to perform on the resource if the tag does not match the regex in `match`|`warn`,`stop`,`copyFromParent`,`setDefault`| - |
|onlyResourceTypes|List of resource types to apply the plugin to. If not specified, the plugin will be applied to all resource types|`ec2`,`ebs`,`snapshot`,`rdsInstance`,`rdsCluster`| - |
|excludeResourceTypes|List of resource types to exclude from the plugin. If not specified, the plugin will be applied to all resource types|`ec2`,`ebs`,`snapshot`,`rdsInstance`,`rdsCluster`| - |

```yaml
  plugins:
    validateTags:
      active: true
      configs:
        -
          tag: Name
          tagMissing:
            - copyFromParent
          onlyResourceTypes:
            - ebs
            - snapshot
          tagNotMatch: []
        -
          tag: Name
          tagMissing:
            - warn
          excludeResourceTypes:
            - ebs
            - snapshot
          tagNotMatch: []
        -
          tag: Schedule
          tagMissing:
            - setDefault: 24x7
          onlyResourceTypes:
            - ec2
            - rdsInstance
            - rdsCluster
          tagNotMatch: []
```

#### powercycleCentral plugin
Incompatible with the powercycle plugin, do not run both at the same time.

Controls the power cycle of resources matching configured filters within the configuration. Matchers are added in the configuration that specify
a generic filter to match specific resources and what power schedule those resources should be on. Resources won't be tagged.

If multiple matches filter the same resource, the matcher with the highest priority will be applied (largest number).

##### Plugin config
| Option                  | Description                                                                | Allowed values                                             | Default    |
| ----------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------- |
| parser                  | Set schedule interpretation format                                         | `strict`                                                   | `strict`   |
| availabilityTag         | Set tag name for individual resource schedules                             | `string` AWS tag name                                      | `Schedule` |
| availabilityTagPriority | Priority to set individually tagged schedules compared to the matchers.    | `number` >= 0                                              | `0`        |
| predefinedSchedules     | List of "shorthand" schedules that can be referenced in the matchers       | list of name:schedule See [strict](######strict) schedules | `[]`       |
| matchers                | List of resource filters paired with a schedule to control power behaviour | `Matcher[]` See [Matcher](######Matcher)                   | `[]`       |

##### Matcher
| Option   | Description                                                                 | Allowed values                                 | Default |
|----------|-----------------------------------------------------------------------------|------------------------------------------------|---------|
| name     | Name of the matcher, used in logging                                        | `string`                                       | -       |
| filter   | Filter configuration to specify which resources this schedule will apply to | `Filter`. See [Filter](######Filter) section   | -       |
| schedule | Resource power schedule, based on the format specified in plugin.parser     | `string`, See [strict](######strict) schedules | -       |
| priority | How to rank this matcher against others, highest number is highest priority | `number` >= 0                                  | `0`     |
| pretend  | Prevents the matcher from actually performing the actions.                  | `true` or `false`                              | `true`  |

##### Filter
Filters specify a set of criteria for a resource to match against. They are comprised of several filter objects than can be joined together with `AND` or `OR` operations.
Filters can be specified as objects or as string arrays, utilizing the [shorthand string format](######Shorthand Format) if the filter has more than one parameter.

* String values for filters can be put in an array to imply an `OR` operation over them.
  e.g. the following filters are equivalent
  ```yaml
  filter:
    or:
      - region: 'ap-southeast-1'
      - region: 'ap-southeast-2'
      - region: 'us-east-1'

  filter:
    region: ['ap-southeast-1', 'ap-southeast-2', 'us-east-1']
  ```
* If the top level value is an array, an implicit `AND` is applied over all filters in the array.
  e.g. the following filters are equivalent
  ```yaml
  excludedResources:
    and:
      - region: 'us-east-1'
      - accountId: '123456789012'

  excludedResources:
    - region: 'us-east-1'
    - accountId: '123456789012'

  ```

###### Available Filters

| Filter Name | Value                                      | Example                                      | Description                                                                                                      |
|-------------|--------------------------------------------|----------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| id          | `string`                                   | `id: 'i-0123456789abcdef'`                   | Matches resource ID                                                                                              |
| state       | `string`                                   | `state: 'running'`                           | Matches resource state                                                                                           |
| tag         | `object { name string, [option]: string }` | `{ name: 'TagName', equals: 'TagValue' }`    | Matches resource tag name                                                                                        |
| name        | `string`                                   | `name: 'app-server'`                         | Matches a tag called 'Name'. Convenience over using the `tag` filter with `name: Name`.                          |
| type        | `string`                                   | `type: 'ec2'`                                | Matches resource type, specifically the Revolver [driver](###Drivers) name                                       |
| region      | `string`                                   | `region: 'ap-southeast-2'`                   | Matches resource region                                                                                          |
| accountId   | `string`                                   | `accountId: '123456789012'`                  | Matches resource accountId                                                                                       |
| resource    | `object { path string, [option]: string }` | `{ path: 'jmes.path', equals: 'pathValue' }` | Matches extra resource properties, specific to the resource type.`path` is a [jmespath](https://jmespath.org/ ), |
| matchWindow | `object { from string, to: string }`       | `{ from: '2024-02-15', to: '2024-02-20' }`   | Matches the current date/time (in ISO 8601 format). Both from/to are optional. Watch out for timezones!          |
| and         | `Filter[]`                                 | -                                            | Matches when _all_ the filters within it match                                                                   |
| or          | `Filter[]`                                 | -                                            | Matches when _any_ of the filters within match                                                                   |
| not         | `Filter`                                   | -                                            | Matches when the filter within _doesn't_ match                                                                   |
| bool        | `true` or `false`                          | true                                         | Matches when set to `true`, doesn't match otherwise                                                              |

###### Options for string compare
Filters with string values can be set to compare strings with different options enabled. If unspecified, the default option will be `equals`.
For object style filters, options are set as fields on the object. Only one option will be applied.
For string style filters, see [Shorthand format](######Shorthand Format).

Option values:
* `equals`: Match the value exactly, case-sensitive
* `iequals`: Match the value case insensitively
* `contains`: Match if contained within the value, case-insensitive
* `startswith`: Match if at the beginning of the value, case-insensitive
* `endswith`: Match if at the end of the value, case-insensitive
* `regexp`: Match any part of value as a regular expression. Use `^` and `$` in the regexp to match the whole value.

###### Shorthand Format
**Object Filters**

Object value filters (e.g. `tag` and `resource`) can be specified in a shorter single string format.`key`depends on the filter type.
e.g. For a `tag` filter, key would be the tag name to match.

Note the double pipe (`||`) between `key` and `option`.
```
key||option|value
```
If `option` is omitted, the default compare option (`equals`) will be used.
```
key|value
```

**Object Filter Examples**
```yaml
tag: [
  'Name|somenametag',
  'Name||equals|somenametag',
  'Name||iequals|sOmENaMetAG',
  'Name||contains|name',
  'Name||startswith|some',
  'Name||endswith|tag',
  'Name||regexp|^[a-z]+$',
]
resource: [
  'Placement.AvailabilityZone|ap-southeast-2c',
  'Placement.AvailabilityZone||equals|ap-southeast-2c',
  'Placement.AvailabilityZone||contains|southeast',
]
```

**String Filters**

String value filters (e.g `region`, `id`, `type`, etc) can set a specific [string match mode](######Options for string compare) with the following format.
```
option|value
```
If `option` is omitted, the default compare option (`equals`) will be used.
```
value
```

**String Filter Examples**
```yaml
region: [
  'ap-southeast-2',
  'equals|ap-southeast-2',
  'iequals|AP-SOUTHEAST-2',
  'contains|southeast',
  'regexp|ap\\-.*\\d$',
  'startswith|ap-south',
  'endswith|east-2'
]
```


###### General Filter Examples
Match all ec2 in ap-southeast-2 unless the tag Schedule is set to ignore.

```yaml
filter:
  - type: ec2
  - region: 'ap-southeast-2'
  - not:
      tag: 'Schedule|ignore'
```

Match any resource with tag Schedule or tag. Note `contains` just checking for an empty string which is always true so the validation is just if the tag exists.
```yaml
filter:
   tag: ['Schedule||contains|', 'Powercycle||contains|'
```

Match EC2s in certain accounts or match RDSs in any US or EU region
```yaml
filter:
  or:
    - and:
        - type: ec2
        - accountId: ["123456789012", "987654321021"]
    - and:
        - type: rdsInstance
        - region: ['startswith|us-', 'startswith|eu-']
```



**Comparing shorthand and long form**

The following filters are identical.

*Shorthand form*
```yaml
filter:
  - type: ['ec2', 'rds']
  - tag: 'CostCenter||contains|things'
  - accountId: ['111111111111', '222222222222']
```

*Object form*
```yaml
filter:
  and:
    - or:
        - type: 'ec2'
        - type: 'rds'
    - tag:
        name: 'CostCenter'
        contains: 'things'
    - or:
      - accountId: '111111111111'
      - accountId: '222222222222'

```


###### JMESPath
[JMESPath](https://jmespath.org/) is a JSON path query language. It's used in revolver to query against detailed resource properties for filtering using the `resource` filter.

To build out a JMESPath, enable the `resourceLog.json` configuration [in the configuration](####Config file) and run revolver with the drivers on `pretend` (to avoid state changes).
This will generate a JSON of all resources. Use this json with `jmespathTester.cjs` to try out different JMESPath queries against your resources.

The tester script will print out each resource ID and the value that JMESPath returned for that resource.
This can be used to determine both the `path` needed for your filter as well as what the `value` or `regexp` shoud be.
e.g.
```
node jmespathTester.cjs resources.json "Placement.AvailabilityZone"
i-09e1c1230e028b62c
"ap-southeast-2c"
i-0bca8d130f9e74ec9
"ap-southeast-2c"
...
```

Notes
* JMESPath uses single quotes for strings
* numbers, booleans and strings can be outputted


##### Example configuration
```yaml
   plugins:
     powercycleCentral:
       active: true
       configs:
         - parser: strict
           availabilityTag: Schedule
           availabilityTagPriority: 5
           predefinedSchedules:
             BusinessHours: 'Start=08:00|mon-fri;Stop=18:00|mon-fri'
             EarlyStartBusinessHours: 'Start=05:00|mon-fri;Stop=18:00|mon-fri'
           matchers:
             - name: default tagged schedule
               filter:
                 - tag: ["CostCentre||value|1234", "CostCentre|4567"]
                 - type: ec2
                 - resource: "Placement.AvailabilityZone||contains|ap-southeast"
               schedule: 24x7
               priority: 1
             - name: no large instances
               filter:
                 or:
                   - resource:
                       path: "InstanceType"
                       regexp: "\\.\\d{0,2}x?large"
                   - resource:
                       path: "InstanceType"
                       regexp: "\\.metal\\-\\d{1,2}xl"
               schedule: "0x7"
               priority: 20
             - name: within australia
               filter:
                 resource:
                   path: "Placement.AvailabilityZone | contains(@, 'ap-southeast')"
                   value: true
               schedule: 24x5
               priority: 10

```
