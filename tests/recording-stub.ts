import type { DioramaHost } from '../src/host';

/** The old fetch stubs, as a host `loadRecording`: the same status/header facts RemHub's HTTP loader maps (204 none, 404 missing,
 *  200 a Recording, else an error). The mapping itself is tested in RemHub (Task 7); here only the resulting values matter. */
export function recordingResponse(status: number, body: unknown = null, headers: Record<string, string> = {}): DioramaHost['loadRecording'] {
  return async () => {
    if (status === 204) return 'none';
    if (status === 404) return 'missing';
    if (status !== 200) throw new Error((body as { error?: string } | null)?.error ?? `HTTP ${status}`);
    const h = (k: string) => headers[k] ?? null;
    const lastId = h('x-recording-last-id');
    return { events: body as unknown[], truncated: h('x-recording-truncated') === 'true', version: Number(h('x-recording-version')) || null, lastId: lastId !== null && Number.isFinite(Number(lastId)) && Number(lastId) > 0 ? Number(lastId) : null, runId: h('x-recording-run') };
  };
}
