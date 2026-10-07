'use client';
import { useMemo } from 'react';
import type { ActivityModule } from '../activity';
import { Diorama } from '../diorama';

/** The record run's own course, kept at the same progress as the live run (spec §3.4). Hidden by the host at 390 px. */
export function SideWindow({ recordRunId, atProgress, activity }: { recordRunId: string; atProgress: number; activity: ActivityModule }) {
  const source = useMemo(() => ({ runId: recordRunId }), [recordRunId]);
  const seekToProgress = useMemo(() => ({ value: atProgress, activity }), [atProgress, activity]);
  return <Diorama source={source} label='Record run' seekToProgress={seekToProgress} compact />;
}
