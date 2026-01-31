import type { FastifyRequest } from 'fastify'

type RequestHeaders = Record<string, string | undefined>

interface StubOptions {
  headers?: RequestHeaders
  rawBody?: Buffer | string
}

export function createFastifyRequestStub(options: StubOptions = {}): FastifyRequest {
  const headers = options.headers ?? {}
  const rawBody = typeof options.rawBody === 'string'
    ? Buffer.from(options.rawBody)
    : options.rawBody

  return {
    headers,
    rawBody,
  } as FastifyRequest & { rawBody?: Buffer }
}
