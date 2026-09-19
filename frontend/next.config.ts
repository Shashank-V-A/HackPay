import type { NextConfig } from 'next'
import { config as loadEnv } from 'dotenv'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const repoRoot = path.resolve(process.cwd(), '..')
loadEnv({ path: path.resolve(repoRoot, '.env') })
loadEnv({ path: path.resolve(process.cwd(), '.env') })
loadEnv({ path: path.resolve(process.cwd(), '.env.local') })

const clientSrc = path.resolve(process.cwd(), 'src/client')

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  env: {
    NEXT_PUBLIC_RAZORPAY_KEY_ID:
      process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
    NEXT_PUBLIC_AWS_REGION: process.env.NEXT_PUBLIC_AWS_REGION || process.env.AWS_REGION || '',
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
    NEXT_PUBLIC_COGNITO_CLIENT_ID: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  turbopack: {
    resolveAlias: {
      '@frontend': clientSrc,
    },
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = { type: 'memory' }
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      '@frontend': clientSrc,
      buffer: require.resolve('buffer/'),
      'ipfs-http-client': path.resolve(process.cwd(), 'src/lib/ipfs-http-client-stub.js'),
    }
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      encoding: false,
    }
    const webpack = require('webpack')
    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
      }),
    )
    return config
  },
}

export default nextConfig
