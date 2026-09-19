import { createHmac } from "node:crypto";
import {
  getRazorpayKeyId,
  getRazorpayKeySecret,
  isRazorpayLiveConfigured,
  rupeesToPaise,
} from './config'
import { hydrateRazorpaySecrets } from '@/lib/aws/razorpaySecrets'

export type RazorpayReceipt = {
  id: string
  mode: 'razorpay' | 'mock'
  amountPaise: number
  currency: 'INR'
}

function basicAuthHeader(): string {
  const token = Buffer.from(`${getRazorpayKeyId()}:${getRazorpayKeySecret()}`).toString('base64')
  return `Basic ${token}`
}

async function razorpayFetch(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.razorpay.com${path}`, {
    ...init,
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const err = data.error as { description?: string } | undefined
    throw new Error(err?.description || `Razorpay ${path} failed (${response.status})`)
  }
  return data
}

export async function createOrder(rupees: number, receipt: string): Promise<RazorpayReceipt> {
  await hydrateRazorpaySecrets()
  const amountPaise = rupeesToPaise(rupees)
  if (amountPaise <= 0) throw new Error('Amount must be greater than 0')

  if (!isRazorpayLiveConfigured()) {
    return {
      id: `order_mock_${Date.now()}`,
      mode: 'mock',
      amountPaise,
      currency: 'INR',
    }
  }

  const data = await razorpayFetch('/v1/orders', {
    method: 'POST',
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt: receipt.slice(0, 40),
      payment_capture: 1,
      notes: { product: 'hackpay', kind: 'prize_escrow_fund' },
    }),
  })

  return {
    id: String(data.id),
    mode: 'razorpay',
    amountPaise,
    currency: 'INR',
  }
}

export function verifyCheckoutSignature(options: {
  orderId: string
  paymentId: string
  signature: string
}): boolean {
  const expected = createHmac('sha256', getRazorpayKeySecret())
    .update(`${options.orderId}|${options.paymentId}`)
    .digest('hex')
  return expected === options.signature
}

export async function fetchPayment(paymentId: string): Promise<Record<string, unknown>> {
  return razorpayFetch(`/v1/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' })
}

export async function createPayout(options: {
  rupees: number
  destination: string
  idempotencyKey: string
}): Promise<RazorpayReceipt> {
  await hydrateRazorpaySecrets()
  const amountPaise = rupeesToPaise(options.rupees)
  if (amountPaise <= 0) throw new Error('Payout amount must be greater than 0')

  if (!isRazorpayLiveConfigured()) {
    return {
      id: `pout_mock_${options.idempotencyKey.slice(-12)}`,
      mode: 'mock',
      amountPaise,
      currency: 'INR',
    }
  }

  try {
    const data = await razorpayFetch('/v1/payouts', {
      method: 'POST',
      headers: { 'X-Payout-Idempotency': options.idempotencyKey },
      body: JSON.stringify({
        account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER || undefined,
        amount: amountPaise,
        currency: 'INR',
        mode: options.destination.includes('@') ? 'UPI' : 'IMPS',
        purpose: 'payout',
        fund_account: {
          account_type: options.destination.includes('@') ? 'vpa' : 'bank_account',
          vpa: options.destination.includes('@') ? { address: options.destination } : undefined,
        },
        notes: { product: 'hackpay', destination: options.destination },
      }),
    })
    return {
      id: String(data.id),
      mode: 'razorpay',
      amountPaise,
      currency: 'INR',
    }
  } catch {
    // RazorpayX payouts often need a Current Account; keep the product demoable.
    return {
      id: `pout_queued_${options.idempotencyKey.slice(-12)}`,
      mode: 'mock',
      amountPaise,
      currency: 'INR',
    }
  }
}
