// What a host hands the diorama for a live run. Events are opaque here: the reducer validates them.
export interface LiveFeed { subscribe(fn: (e: unknown, id: number | null) => void): () => void; epoch: number }
export type TimelineSource = { live: true } | { runId: string };
