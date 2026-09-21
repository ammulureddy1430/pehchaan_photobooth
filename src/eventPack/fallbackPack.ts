import { STAGE_HEIGHT, STAGE_WIDTH } from '../types'
import type { EventPack, PackSlot } from './types'

function threeShotSlots(): PackSlot[] {
  const left = 24
  const width = 400 - left * 2
  const top = 24
  const gap = 8
  const available = 936
  const height = Math.floor((available - gap * 2) / 3)

  return [1, 2, 3].map((shotNumber, index) => ({
    id: `slot-${shotNumber}`,
    shotNumber,
    x: left,
    y: top + index * (height + gap),
    width,
    height,
    fit: 'cover',
    effect: index === 1 ? 'sepia' : index === 2 ? 'black-and-white' : 'none',
  }))
}

export const FALLBACK_PACK_ID = 'pehchaan-fallback'

export const FALLBACK_PACK: EventPack = {
  id: FALLBACK_PACK_ID,
  version: '1.1.0',
  eventName: 'Pehchaan Photobooth',
  language: 'en',
  shotCount: 3,
  betweenShotPauseMs: 0,
  mirrorOutput: true,
  blackAndWhiteEnabled: true,
  sepiaEnabled: true,
  whatsappEnabled: false,
  emailEnabled: false,
  cloudQrEnabled: false,
  printEnabled: false,
  composition: {
    id: 'fallback-strip',
    name: 'Pehchaan portrait strip',
    width: 400,
    height: 1200,
    background: '#0b0a09',
    overlayEnabled: false,
    slots: threeShotSlots(),
    texts: [
      {
        id: 'wordmark',
        text: 'PEHCHAAN',
        x: 200,
        y: 1050,
        font: '600 44px "Cormorant Garamond", serif',
        color: '#e8d5a3',
        align: 'center',
        baseline: 'middle',
      },
      {
        id: 'sub',
        text: 'PHOTOBOOTH',
        x: 200,
        y: 1100,
        font: '500 18px Outfit, system-ui, sans-serif',
        color: '#c6a15b',
        align: 'center',
        baseline: 'middle',
      },
    ],
  },
}

export function getFallbackPack(): EventPack {
  const pack = structuredClone(FALLBACK_PACK)
  pack.singleShotComposition = {
    ...structuredClone(pack.composition),
    id: 'fallback-portrait',
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    slots: [{ ...pack.composition.slots[0], x: 78, y: 86, width: STAGE_WIDTH - 156, height: 742 }],
    texts: pack.composition.texts.map((text, index) => ({
      ...text, x: STAGE_WIDTH / 2, y: index === 0 ? 920 : 972,
    })),
  }
  return pack
}
