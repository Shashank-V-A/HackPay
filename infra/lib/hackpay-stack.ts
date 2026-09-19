import * as path from 'path'
import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as amplify from 'aws-cdk-lib/aws-amplify'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions'

export interface HackPayStackProps extends cdk.StackProps {
  /** Public app URL after Amplify deploy (used by agent Lambda). */
  appUrl?: string
}

/**
 * Ship It stack: Cognito + DynamoDB + S3/CloudFront + SNS +
 * EventBridge→Lambda agent tick + Amplify Hosting shell.
 */
export class HackPayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: HackPayStackProps) {
    super(scope, id, props)

    const agentCronSecret = new secretsmanager.Secret(this, 'AgentCronSecret', {
      secretName: 'hackpay/agent-cron-secret',
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 48,
      },
    })

    // ── Cognito ──────────────────────────────────────────────
    const userPool = new cognito.UserPool(this, 'HackPayUserPool', {
      userPoolName: 'hackpay-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      customAttributes: {
        role: new cognito.StringAttribute({ mutable: true, minLen: 3, maxLen: 32 }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: false,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
    })

    const preSignUp = new lambda.Function(this, 'CognitoPreSignUp', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
exports.handler = async (event) => {
  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;
  return event;
};
`),
      timeout: cdk.Duration.seconds(5),
    })
    userPool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, preSignUp)

    const userPoolClient = userPool.addClient('HackPayWebClient', {
      userPoolClientName: 'hackpay-web',
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      generateSecret: false,
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true, fullname: true, emailVerified: true })
        .withCustomAttributes('role'),
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true, fullname: true })
        .withCustomAttributes('role'),
    })

    // ── DynamoDB (replaces RDS) ──────────────────────────────
    const dataTable = new dynamodb.Table(this, 'HackPayTable', {
      tableName: 'hackpay-data',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    dataTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    dataTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'gsi2pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi2sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    // ── S3 + CloudFront ──────────────────────────────────────
    const assetsBucket = new s3.Bucket(this, 'HackPayAssets', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    })

    // Some new AWS accounts block CloudFront until Support verifies the account.
    // Deploy with: npx cdk deploy -c skipCloudFront=true
    const skipCloudFront = String(this.node.tryGetContext('skipCloudFront') || '') === 'true'
    let cloudFrontUrl = `https://${assetsBucket.bucketRegionalDomainName}`
    if (!skipCloudFront) {
      const oai = new cloudfront.OriginAccessIdentity(this, 'AssetsOai')
      assetsBucket.grantRead(oai)
      const distribution = new cloudfront.Distribution(this, 'HackPayCdn', {
        comment: 'HackPay receipts and audit assets',
        defaultBehavior: {
          origin: new origins.S3Origin(assetsBucket, { originAccessIdentity: oai }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      })
      cloudFrontUrl = `https://${distribution.distributionDomainName}`
    }

    const alertsTopic = new sns.Topic(this, 'HackPayAlerts', {
      topicName: 'hackpay-alerts',
      displayName: 'HackPay Agent Alerts',
    })

    // Optional Razorpay keys (JSON). Leave Amplify env as primary; app hydrates from this ARN only if env empty.
    const razorpaySecret = new secretsmanager.Secret(this, 'RazorpaySecret', {
      secretName: 'hackpay/razorpay',
      description:
        'Optional JSON: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAYX_ACCOUNT_NUMBER. Update in console; do not commit values.',
      secretStringValue: cdk.SecretValue.unsafePlainText(
        JSON.stringify({
          RAZORPAY_KEY_ID: '',
          RAZORPAY_KEY_SECRET: '',
          RAZORPAYX_ACCOUNT_NUMBER: '',
        }),
      ),
    })

    const appUrl =
      props?.appUrl ||
      this.node.tryGetContext('appUrl') ||
      'https://main.d39l7wna3d1uyn.amplifyapp.com'

    const agentFn = new lambda.Function(this, 'AgentTickFn', {
      functionName: 'hackpay-agent-tick',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/agent-tick')),
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: {
        APP_URL: String(appUrl),
        AGENT_CRON_SECRET: agentCronSecret.secretValue.unsafeUnwrap(),
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    })

    agentCronSecret.grantRead(agentFn)

    new events.Rule(this, 'AgentTickSchedule', {
      ruleName: 'hackpay-agent-tick-hourly',
      description: 'Orchestration agent: funding / winners / propose / release',
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
      targets: [new targets.LambdaFunction(agentFn)],
    })

    const amplifyApp = new amplify.CfnApp(this, 'HackPayAmplifyApp', {
      name: 'hackpay',
      description: 'HackPay Next.js — Cognito + DynamoDB Ship It',
      platform: 'WEB_COMPUTE',
      environmentVariables: [
        { name: 'AMPLIFY_MONOREPO_APP_ROOT', value: 'frontend' },
        { name: 'NEXT_PUBLIC_AWS_REGION', value: this.region },
        { name: 'NEXT_PUBLIC_COGNITO_USER_POOL_ID', value: userPool.userPoolId },
        { name: 'NEXT_PUBLIC_COGNITO_CLIENT_ID', value: userPoolClient.userPoolClientId },
        { name: 'DYNAMODB_TABLE_NAME', value: dataTable.tableName },
        { name: 'NEXT_PUBLIC_S3_BUCKET', value: assetsBucket.bucketName },
        { name: 'NEXT_PUBLIC_CLOUDFRONT_URL', value: cloudFrontUrl },
        { name: 'NEXT_PUBLIC_SNS_TOPIC_ARN', value: alertsTopic.topicArn },
        { name: 'SNS_TOPIC_ARN', value: alertsTopic.topicArn },
        { name: 'RAZORPAY_SECRET_ARN', value: razorpaySecret.secretArn },
        { name: 'STRANDS_ENABLED', value: 'true' },
        { name: 'BEDROCK_MODEL_ID', value: 'amazon.nova-lite-v1:0' },
      ],
    })

    new amplify.CfnBranch(this, 'AmplifyMainBranch', {
      appId: amplifyApp.attrAppId,
      branchName: 'main',
      stage: 'PRODUCTION',
      enableAutoBuild: true,
      framework: 'Next.js - SSR',
    })

    const agentErrorsAlarm = new cloudwatch.Alarm(this, 'AgentTickErrorsAlarm', {
      alarmName: 'hackpay-agent-tick-errors',
      alarmDescription: 'HackPay agent Lambda Errors > 0 (ops demo)',
      metric: agentFn.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    })
    agentErrorsAlarm.addAlarmAction(new cw_actions.SnsAction(alertsTopic))

    const appRuntimePolicy = new iam.ManagedPolicy(this, 'HackPayAppRuntimePolicy', {
      description: 'DynamoDB, S3, SNS, Secrets, Bedrock, SES for HackPay Next.js SSR',
      statements: [
        new iam.PolicyStatement({
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:DeleteItem',
            'dynamodb:Query',
            'dynamodb:Scan',
            'dynamodb:BatchGetItem',
            'dynamodb:BatchWriteItem',
            'dynamodb:DescribeTable',
          ],
          resources: [dataTable.tableArn, `${dataTable.tableArn}/index/*`],
        }),
        new iam.PolicyStatement({
          actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject', 's3:ListBucket'],
          resources: [assetsBucket.bucketArn, `${assetsBucket.bucketArn}/*`],
        }),
        new iam.PolicyStatement({
          actions: ['sns:Publish', 'sns:Subscribe'],
          resources: [alertsTopic.topicArn],
        }),
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [agentCronSecret.secretArn, razorpaySecret.secretArn],
        }),
        new iam.PolicyStatement({
          sid: 'SesSendOptional',
          actions: ['ses:SendEmail', 'ses:SendRawEmail'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          sid: 'BedrockInvokeForStrands',
          actions: [
            'bedrock:InvokeModel',
            'bedrock:InvokeModelWithResponseStream',
            'bedrock:Converse',
            'bedrock:ConverseStream',
          ],
          resources: ['*'],
        }),
      ],
    })

    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId })
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId })
    new cdk.CfnOutput(this, 'DynamoTableName', { value: dataTable.tableName })
    new cdk.CfnOutput(this, 'DynamoTableArn', { value: dataTable.tableArn })
    new cdk.CfnOutput(this, 'AssetsBucketName', { value: assetsBucket.bucketName })
    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: cloudFrontUrl,
      description: skipCloudFront
        ? 'CloudFront skipped (account unverified); S3 regional domain used as placeholder'
        : 'CloudFront distribution URL',
    })
    new cdk.CfnOutput(this, 'AlertsTopicArn', { value: alertsTopic.topicArn })
    new cdk.CfnOutput(this, 'AgentCronSecretArn', { value: agentCronSecret.secretArn })
    new cdk.CfnOutput(this, 'RazorpaySecretArn', { value: razorpaySecret.secretArn })
    new cdk.CfnOutput(this, 'AgentLambdaName', { value: agentFn.functionName })
    new cdk.CfnOutput(this, 'AgentErrorsAlarmName', { value: agentErrorsAlarm.alarmName })
    new cdk.CfnOutput(this, 'AmplifyAppId', { value: amplifyApp.attrAppId })
    new cdk.CfnOutput(this, 'AppRuntimePolicyArn', { value: appRuntimePolicy.managedPolicyArn })
    new cdk.CfnOutput(this, 'Region', { value: this.region })
    new cdk.CfnOutput(this, 'WafNote', {
      value:
        'Attach AWS WAF WebACL to Amplify in console (Security → WAF) for the security checkbox; not auto-associated to avoid breaking deploys.',
    })
  }
}
