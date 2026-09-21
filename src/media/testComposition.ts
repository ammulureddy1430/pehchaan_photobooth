import type { ShotMode } from '../types'
import { getFallbackPack } from '../eventPack/fallbackPack'
import { compositionFromPack } from '../eventPack/compositionFromPack'
import type { CompositionSpec } from './composition'

export async function createTestComposition(mode: ShotMode): Promise<CompositionSpec> {
  const composition = await compositionFromPack(getFallbackPack(), mode)
  return {
    ...composition,
    id: mode === 3 ? 'test-strip-3' : 'test-portrait-1',
    name: mode === 3 ? 'Test 3-shot strip' : 'Test 1-shot portrait',
  }
}
