import { canvasToPng, releaseCanvas } from '../media/jpeg'
import type { CompositionSpec, OverlayLayer, PhotoSlot } from '../media/composition'
import { type ShotMode } from '../types'
import type { EventPack } from './types'
import { FALLBACK_PACK_ID, getFallbackPack } from './fallbackPack'

async function createFrameOverlay(width: number, height: number): Promise<OverlayLayer> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    releaseCanvas(canvas)
    throw new Error('Could not create the composition overlay.')
  }

  try {
    context.clearRect(0, 0, width, height)
    context.strokeStyle = 'rgba(198, 161, 91, 0.9)'
    context.lineWidth = 5
    context.strokeRect(28, 28, width - 56, height - 56)

    context.strokeStyle = 'rgba(232, 213, 163, 0.95)'
    context.lineWidth = 3
    const mark = 42
    context.beginPath()
    context.moveTo(28, 28 + mark)
    context.lineTo(28, 28)
    context.lineTo(28 + mark, 28)
    context.moveTo(width - 28 - mark, 28)
    context.lineTo(width - 28, 28)
    context.lineTo(width - 28, 28 + mark)
    context.moveTo(28, height - 28 - mark)
    context.lineTo(28, height - 28)
    context.lineTo(28 + mark, height - 28)
    context.moveTo(width - 28 - mark, height - 28)
    context.lineTo(width - 28, height - 28)
    context.lineTo(width - 28, height - 28 - mark)
    context.stroke()

    return {
      png: await canvasToPng(canvas),
      x: 0,
      y: 0,
      width,
      height,
    }
  } finally {
    releaseCanvas(canvas)
  }
}

function applyPackEffects(slot: PhotoSlot, pack: EventPack): PhotoSlot {
  if (slot.effect === 'black-and-white' && !pack.blackAndWhiteEnabled) {
    return { ...slot, effect: 'none' }
  }

  if (slot.effect === 'sepia' && !pack.sepiaEnabled) {
    return { ...slot, effect: 'none' }
  }

  return slot
}

export function supportsShotMode(pack: EventPack, mode: ShotMode): boolean {
  return mode === 1 || mode <= pack.shotCount
}

export async function compositionFromPack(
  pack: EventPack,
  mode: ShotMode,
): Promise<CompositionSpec> {
  if (!supportsShotMode(pack, mode)) {
    throw new Error(`This Event Pack supports ${pack.shotCount} shots. Mode ${mode} is not compatible.`)
  }
  // Refresh built-in geometry even when an older pack is cached on the booth.
  const layoutPack = pack.id === FALLBACK_PACK_ID ? getFallbackPack() : pack
  const composition = mode === 1 && layoutPack.singleShotComposition
    ? layoutPack.singleShotComposition : layoutPack.composition
  const slots = composition.slots.filter(slot => slot.shotNumber <= mode)
  if (slots.length !== mode) throw new Error('The layout does not match the selected shot count.')

  return {
    id: composition.id,
    name: composition.name,
    width: composition.width,
    height: composition.height,
    background: composition.background,
    slots: slots.map(slot => applyPackEffects(slot, pack)),
    overlay: composition.overlayEnabled
      ? await createFrameOverlay(composition.width, composition.height)
      : undefined,
    texts: composition.texts,
  }
}
