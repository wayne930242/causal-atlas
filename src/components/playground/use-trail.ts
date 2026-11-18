import { useState } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { Assignment } from '../../engine/index.ts'
import { solve } from '../model/model-state.ts'
import type { TrailEntry } from './trail.ts'
import { TRAIL_LENGTH, trailEntry } from './trail.ts'

/** The trail of the tracked nodes: the last readings, and whether older ones gave way. */
export interface Trail {
  readonly entries: readonly TrailEntry[]
  /** Older readings gave way to the last TRAIL_LENGTH. */
  readonly dropped: boolean
}

/**
 * The trail under the graph: a reading of the tracked nodes is added, during render, whenever what
 * is set (`setting`) changes; `restart` starts it again from the case with nothing set.
 */
export function useTrail(
  c: LoadedCase,
  track: readonly string[],
  world: { readonly probs?: Readonly<Record<string, number>>; readonly values?: Assignment },
  setting: string,
): readonly [Trail, () => void] {
  const startTrail = (): Trail => ({ entries: [trailEntry(solve(c, {}), track, '')], dropped: false })
  const [trail, setTrail] = useState<Trail>(startTrail)
  if (track.length > 0 && trail.entries[trail.entries.length - 1]?.setting !== setting) {
    const entries = [...trail.entries, trailEntry(world, track, setting)]
    setTrail({ entries: entries.slice(-TRAIL_LENGTH), dropped: trail.dropped || entries.length > TRAIL_LENGTH })
  }
  return [trail, () => setTrail(startTrail())]
}
