import 'server-only'

/**
 * Server-side error logging. Every `catch` in server code should call one of
 * these instead of swallowing the error or passing it straight to console.
 *
 * WHY NOT `console.error(err)`: provider errors carry sensitive data.
 *  - Plaid's client throws Axios errors whose `config` includes the request
 *    body — i.e. our PLAID client_id and SECRET, plus access tokens.
 *  - MongoDB duplicate-key errors echo the duplicate value (often an email).
 *  - Stripe errors are mostly safe but include the raw request/response.
 * `describeError` keeps only the fields useful for debugging (codes, messages,
 * request ids, stack) so logs stay useful without becoming a leak.
 *
 * Rule of thumb for `extra`: pass ids (tenantId, invoiceId), never emails,
 * names, tokens or amounts tied to a person.
 */

type Fields = Record<string, unknown>

function field(obj: object, key: string): unknown {
  return (obj as Record<string, unknown>)[key]
}

export function describeError(err: unknown): Fields {
  if (!err || typeof err !== 'object') return { value: String(err) }

  // Plaid (Axios): structured details live in response.data — never log `config`.
  const response = field(err, 'response')
  if (field(err, 'isAxiosError') === true || (response && typeof response === 'object' && field(response, 'data'))) {
    const status = response && typeof response === 'object' ? field(response, 'status') : undefined
    const data = response && typeof response === 'object' ? field(response, 'data') : undefined
    const d = data && typeof data === 'object' ? data : {}
    return {
      kind: 'plaid/http',
      status,
      error_type: field(d, 'error_type'),
      error_code: field(d, 'error_code'),
      error_message: field(d, 'error_message'),
      request_id: field(d, 'request_id'),
    }
  }

  // Stripe: error.type is e.g. 'StripeCardError', 'StripeInvalidRequestError'.
  const type = field(err, 'type')
  if (typeof type === 'string' && type.startsWith('Stripe')) {
    return {
      kind: 'stripe',
      type,
      code: field(err, 'code'),
      message: field(err, 'message'),
      statusCode: field(err, 'statusCode'),
      requestId: field(err, 'requestId'),
    }
  }

  // MongoDB: log the code only — messages can contain the offending values (PII).
  const name = field(err, 'name')
  if (typeof name === 'string' && name.startsWith('Mongo')) {
    return { kind: 'mongo', name, code: field(err, 'code'), codeName: field(err, 'codeName') }
  }

  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack }
  return { value: '[non-Error object thrown]' }
}

/** A real failure (provider/DB/email outage, bug). Shows as an error in Vercel logs. */
export function logError(context: string, err: unknown, extra?: Fields): void {
  console.error(`[${context}]`, JSON.stringify({ ...extra, error: describeError(err) }))
}

/**
 * An EXPECTED rejection (bad user input, invalid signature, expired cookie).
 * Logged briefly at warn level — useful for spotting abuse, without the noise
 * of full error objects.
 */
export function logWarn(context: string, message: string, extra?: Fields): void {
  console.warn(`[${context}] ${message}`, extra ? JSON.stringify(extra) : '')
}
