/**
 * pgvector native vector_send format: big-endian int16 dimension, int16 zero,
 * then IEEE-754 float32 elements in network byte order. No COPY file framing.
 * Reviewed source: https://github.com/pgvector/pgvector/blob/v0.8.7/src/vector.c
 * PostgreSQL float transport: src/backend/libpq/pqformat.c pq_sendfloat4.
 */
export const PGVECTOR_BINARY_ENCODING = 'pgvector-send-base64-v1' as const;

export function decodePgvectorSendBase64(value: unknown, expectedDimensions = 1536): number[] {
  if (typeof value !== 'string' || !value.length
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Invalid pgvector base64');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || bytes.length < 4) throw new Error('Noncanonical pgvector base64');
  const dimensions = bytes.readUInt16BE(0);
  if (!Number.isInteger(expectedDimensions) || expectedDimensions < 1 || dimensions !== expectedDimensions
    || dimensions > 16000 || bytes.readUInt16BE(2) !== 0 || bytes.length !== 4 + 4 * dimensions) {
    throw new Error('Invalid pgvector dimensions, reserved header or length');
  }
  const result = Array.from({ length: dimensions }, (_, index) => bytes.readFloatBE(4 + 4 * index));
  if (result.some((number) => !Number.isFinite(number))) throw new Error('Non-finite pgvector element');
  return result;
}

/** Exact native reconstruction, useful for protected restore/bit-level checks. */
export function encodePgvectorSendBase64(values: number[]): string {
  if (!values.length || values.length > 16000 || values.some((value) => !Number.isFinite(value)
    || !Object.is(Math.fround(value), value))) throw new Error('Encoding requires exact finite float32 values');
  const bytes = Buffer.alloc(4 + 4 * values.length);
  bytes.writeUInt16BE(values.length, 0);
  bytes.writeUInt16BE(0, 2);
  values.forEach((value, index) => bytes.writeFloatBE(value, 4 + 4 * index));
  return bytes.toString('base64');
}
