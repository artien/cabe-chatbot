export const DOKU_CONFIG = {
  CLIENT_ID: 'BRN-0250-1781766374813',
  SECRET_KEY: 'SK-NtmxEClLgaK7570cVQMx',
  BASE_URL: 'https://api-sandbox.doku.com',
  PRO_PLAN_AMOUNT: 50000,
  CURRENCY: 'IDR',
  PAYMENT_DUE_MINUTES: 60,
};

export interface DokuEnv {
  DOKU_CLIENT_ID?: string;
  DOKU_SECRET_KEY?: string;
  DOKU_BASE_URL?: string;
}

export interface CreateCheckoutParams {
  env?: DokuEnv;
  origin: string;
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
  invoiceNumber?: string;
  amount?: number;
}

export interface CheckoutResult {
  success: boolean;
  invoiceNumber: string;
  paymentUrl: string;
  amount: number;
  rawResponse: any;
}

export interface CheckStatusResult {
  success: boolean;
  invoiceNumber: string;
  status: string;
  isPaid: boolean;
  amount?: number;
  rawResponse: any;
}

/**
 * Generates Base64 encoded SHA-256 digest of request body JSON string.
 */
export async function generateDigest(jsonBody: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonBody);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return btoa(String.fromCharCode(...hashArray));
}

/**
 * Generates DOKU HMAC-SHA256 Signature Header.
 * Component format:
 * POST: Client-Id:{clientId}\nRequest-Id:{requestId}\nRequest-Timestamp:{timestamp}\nRequest-Target:{target}\nDigest:{digest}
 * GET:  Client-Id:{clientId}\nRequest-Id:{requestId}\nRequest-Timestamp:{timestamp}\nRequest-Target:{target}
 */
export async function generateSignature(
  clientId: string,
  requestId: string,
  requestTimestamp: string,
  requestTarget: string,
  secretKey: string,
  digest?: string
): Promise<string> {
  let component = `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${requestTimestamp}\nRequest-Target:${requestTarget}`;
  if (digest) {
    component += `\nDigest:${digest}`;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(component));
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  const base64Signature = btoa(String.fromCharCode(...signatureArray));

  return `HMACSHA256=${base64Signature}`;
}

/**
 * Evaluates whether a given DOKU transaction status string indicates successful payment.
 */
export function isPaymentSuccessful(status?: string | null): boolean {
  if (!status) return false;
  const normalized = status.trim().toUpperCase();
  return (
    normalized === 'SUCCESS' ||
    normalized === 'PAID' ||
    normalized === 'SETTLED' ||
    normalized === 'SUCCESSFUL' ||
    normalized === 'COMPLETED'
  );
}

/**
 * Creates a DOKU Checkout payment session and returns the hosted checkout URL.
 */
export async function createDokuCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
  const clientId = params.env?.DOKU_CLIENT_ID || DOKU_CONFIG.CLIENT_ID;
  const secretKey = params.env?.DOKU_SECRET_KEY || DOKU_CONFIG.SECRET_KEY;
  const baseUrl = (params.env?.DOKU_BASE_URL || DOKU_CONFIG.BASE_URL).replace(/\/$/, '');
  const amount = params.amount || DOKU_CONFIG.PRO_PLAN_AMOUNT;

  const invoiceNumber =
    params.invoiceNumber || `INV-PRO-${params.user.id.slice(0, 8)}-${Date.now()}`;

  const requestId = crypto.randomUUID();
  const requestTimestamp = new Date().toISOString().slice(0, 19) + 'Z';
  const requestTarget = '/checkout/v1/payment';

  const callbackUrl = `${params.origin}/dashboard?payment=complete&invoice=${encodeURIComponent(
    invoiceNumber
  )}`;

  const customerName =
    params.user.name?.trim() ||
    params.user.email.split('@')[0] ||
    'Subscriber';

  const payload = {
    order: {
      invoice_number: invoiceNumber,
      amount: amount,
      currency: DOKU_CONFIG.CURRENCY,
      callback_url: callbackUrl,
      auto_redirect: true,
    },
    payment: {
      payment_due_date: DOKU_CONFIG.PAYMENT_DUE_MINUTES,
    },
    customer: {
      id: params.user.id,
      name: customerName,
      email: params.user.email,
    },
  };

  const payloadString = JSON.stringify(payload);
  const digest = await generateDigest(payloadString);
  const signature = await generateSignature(
    clientId,
    requestId,
    requestTimestamp,
    requestTarget,
    secretKey,
    digest
  );

  const response = await fetch(`${baseUrl}${requestTarget}`, {
    method: 'POST',
    headers: {
      'Client-Id': clientId,
      'Request-Id': requestId,
      'Request-Timestamp': requestTimestamp,
      'Signature': signature,
      'Digest': digest,
      'Content-Type': 'application/json',
    },
    body: payloadString,
  });

  const responseBody = await response.json() as any;

  if (!response.ok) {
    const errorMsg =
      (Array.isArray(responseBody?.message)
        ? responseBody.message.join(', ')
        : responseBody?.message) ||
      responseBody?.error ||
      `DOKU Checkout HTTP ${response.status}`;
    throw new Error(`DOKU Checkout Error: ${errorMsg}`);
  }

  const paymentUrl =
    responseBody?.response?.payment?.url ||
    responseBody?.response?.payment_url ||
    responseBody?.response?.url ||
    responseBody?.payment?.url;

  if (!paymentUrl) {
    throw new Error('DOKU Checkout did not return a payment URL in the response.');
  }

  return {
    success: true,
    invoiceNumber,
    paymentUrl,
    amount,
    rawResponse: responseBody,
  };
}

/**
 * Checks the status of an order / invoice from DOKU.
 */
export async function checkDokuOrderStatus(params: {
  env?: DokuEnv;
  invoiceNumber: string;
}): Promise<CheckStatusResult> {
  const clientId = params.env?.DOKU_CLIENT_ID || DOKU_CONFIG.CLIENT_ID;
  const secretKey = params.env?.DOKU_SECRET_KEY || DOKU_CONFIG.SECRET_KEY;
  const baseUrl = (params.env?.DOKU_BASE_URL || DOKU_CONFIG.BASE_URL).replace(/\/$/, '');

  const requestId = crypto.randomUUID();
  const requestTimestamp = new Date().toISOString().slice(0, 19) + 'Z';
  const requestTarget = `/orders/v1/status/${params.invoiceNumber}`;

  const signature = await generateSignature(
    clientId,
    requestId,
    requestTimestamp,
    requestTarget,
    secretKey
  );

  const response = await fetch(`${baseUrl}${requestTarget}`, {
    method: 'GET',
    headers: {
      'Client-Id': clientId,
      'Request-Id': requestId,
      'Request-Timestamp': requestTimestamp,
      'Signature': signature,
    },
  });

  const responseBody = await response.json() as any;

  if (!response.ok) {
    const errorMsg =
      (Array.isArray(responseBody?.message)
        ? responseBody.message.join(', ')
        : responseBody?.message) ||
      responseBody?.error ||
      `DOKU Status HTTP ${response.status}`;
    return {
      success: false,
      invoiceNumber: params.invoiceNumber,
      status: 'UNKNOWN',
      isPaid: false,
      rawResponse: responseBody,
    };
  }

  // Parse transaction status or order status from DOKU response
  const transactionStatus =
    responseBody?.transaction?.status ||
    responseBody?.order?.status ||
    responseBody?.status ||
    'PENDING';

  const isPaid = isPaymentSuccessful(transactionStatus);
  const amount = responseBody?.order?.amount
    ? Number(responseBody.order.amount)
    : undefined;

  return {
    success: true,
    invoiceNumber: params.invoiceNumber,
    status: transactionStatus,
    isPaid,
    amount,
    rawResponse: responseBody,
  };
}
