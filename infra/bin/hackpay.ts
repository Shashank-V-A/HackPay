#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { HackPayStack } from '../lib/hackpay-stack'

const app = new cdk.App()

const appUrl = app.node.tryGetContext('appUrl') as string | undefined

new HackPayStack(app, 'HackPayStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'ap-south-1',
  },
  description: 'HackPay — dual-control prize escrow on AWS (Ship It)',
  appUrl,
})

app.synth()
