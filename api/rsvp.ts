/** Deliberately fail closed until token checks, validation and persistence exist. */
export function POST(): Response {
  return Response.json({ error: { code: 'NOT_READY', message: 'Konfirmasi kehadiran belum dibuka.' } }, {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
