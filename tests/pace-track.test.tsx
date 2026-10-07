import { render, screen } from '@testing-library/react';
import { PaceTrack } from '../src/comparison/pace-track';
import { paceIndex } from '../src/comparison/pace';
import { PARKOUR_ACTIVITY } from '../src/activity';
import { emptyTimeline } from '../src/timeline';

const run = (points: [number, number][]) => ({ ...emptyTimeline(), runId: 'x', startT: 0, lastT: points.at(-1)![0], scores: points.map(([t, score]) => ({ t, score })) });

it('says ahead with seconds and the score it compares at', () => {
  render(<PaceTrack live={run([[0, 0], [15_000, 200]])} T={15_000} record={paceIndex(run([[0, 0], [20_000, 200]]), PARKOUR_ACTIVITY)} activity={PARKOUR_ACTIVITY} />);
  expect(screen.getByText('+5.0 s ahead at 200')).toBeInTheDocument();
});
it('says "No record yet" without a record', () => {
  render(<PaceTrack live={run([[0, 0], [1000, 10]])} T={1000} record={null} activity={PARKOUR_ACTIVITY} />);
  expect(screen.getByText('No record yet')).toBeInTheDocument();
});
it('says she is past the record run', () => {
  render(<PaceTrack live={run([[0, 0], [9000, 400]])} T={9000} record={paceIndex(run([[0, 0], [5000, 300]]), PARKOUR_ACTIVITY)} activity={PARKOUR_ACTIVITY} />);
  expect(screen.getByText('Past the record run (300)')).toBeInTheDocument();
});
