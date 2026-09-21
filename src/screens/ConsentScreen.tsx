import { useState } from 'react'
import type { EventPack } from '../eventPack/types'
import './ConsentScreen.css'

interface ConsentScreenProps {
  pack: EventPack
  busy?: boolean
  onAgree: (options: { shareOptIn: boolean }) => void
  onCancel: () => void
}

export function ConsentScreen({ pack, busy = false, onAgree, onCancel }: ConsentScreenProps) {
  const [shareOptIn, setShareOptIn] = useState(false)
  const isHindi = pack.language === 'hi'
  const isExplicitShare = pack.consentMode === 'explicitShare'

  const defaultLinesEn = [
    '• Photos are taken and saved safely on this photobooth.',
    '• Photos can be printed here or sent to your phone if you choose.',
    '• Digital copies are stored safely and deleted automatically after 72 hours.',
    '• School event photos are never shared publicly without permission.',
  ]

  const defaultLinesHi = [
    '• पोर्ट्रेट इस निजी स्टूडियो कियोस्क पर स्थानीय रूप से लिए जाते हैं।',
    '• फ़ोटो बूथ पर प्रिंट किए जा सकते हैं या आपके अनुरोध पर भेजे जा सकते हैं।',
    '• डिजिटल प्रतियां सुरक्षित रूप से 72 घंटों की नीति के अनुसार रखी जाती हैं।',
    '• स्कूल आयोजनों की तस्वीरें बिना अनुमति सार्वजनिक गैलरी में नहीं डाली जाती हैं।',
  ]

  const customText = isHindi ? pack.consentTextHi : pack.consentTextEn
  const lines = customText
    ? customText.split('\n').filter((l) => l.trim().length > 0)
    : isHindi
      ? defaultLinesHi
      : defaultLinesEn

  const title = isHindi ? 'गोपनीयता और सहमति' : 'Privacy & Photo Consent'
  const subtitle = isHindi
    ? 'फ़ोटो लेने से पहले कृपया निम्नलिखित जानकारी पढ़ें:'
    : 'Please review before taking your photo:'


  return (
    <section className="screen consent-screen">
      <div className="attract-glow" />
      <div className="gold-frame consent-frame" />

      <div className="consent-card">
        <p className="consent-kicker">{pack.eventName}</p>
        <h1 className="consent-title">{title}</h1>
        <p className="consent-sub">{subtitle}</p>

        <div className="consent-rule" />

        <ul className="consent-points" aria-label="Consent details">
          {lines.map((line, index) => (
            <li key={index} className="consent-point">
              {line.startsWith('•') ? line : `• ${line}`}
            </li>
          ))}
        </ul>

        {isExplicitShare && (
          <label className="consent-share-optin">
            <input
              type="checkbox"
              checked={shareOptIn}
              onChange={(e) => setShareOptIn(e.target.checked)}
              disabled={busy}
            />
            <span>
              {isHindi
                ? 'मैं अपनी फ़ोटो डिजिटल रूप से साझा / बैकअप करने की अनुमति देता/देती हूँ (वैकल्पिक)'
                : 'I consent to optional digital sharing / private backup (Optional)'}
            </span>
          </label>
        )}

        <div className="consent-actions">
          <button
            className="btn btn-primary consent-btn-agree"
            type="button"
            disabled={busy}
            onClick={() => onAgree({ shareOptIn })}
          >
            {isHindi ? 'मैं सहमत हूँ' : 'I agree'}
          </button>
          <button
            className="btn btn-ghost consent-btn-cancel"
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            {isHindi ? 'नहीं, धन्यवाद' : 'No thanks'}
          </button>
        </div>
      </div>
    </section>
  )
}
