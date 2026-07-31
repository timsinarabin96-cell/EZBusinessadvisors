'use client'

// Certificate generation — renders an elegant, printable certificate and
// lets the broker download it as a PNG. Uses pure DOM + canvas, no heavy deps.

export default function TrainingCertificate({
  brokerName = 'Broker',
  moduleTitle = 'Business Brokerage Fundamentals',
  moduleId = 'M1',
  issuedAt,
}: {
  brokerName?: string
  moduleTitle?: string
  moduleId?: string
  issuedAt?: string | null
}) {
  const date = issuedAt ? new Date(issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''

  const download = () => {
    // Build an offscreen certificate for export
    const w = 1200, h = 850
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // paper
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#fbfaf6'); g.addColorStop(1, '#f3efe6')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    // gold border
    ctx.strokeStyle = '#c9a84c'
    ctx.lineWidth = 14
    ctx.strokeRect(30, 30, w - 60, h - 60)

    // inner border
    ctx.strokeStyle = '#e0c97e'
    ctx.lineWidth = 2
    ctx.strokeRect(56, 56, w - 112, h - 112)

    // header
    ctx.textAlign = 'center'
    ctx.fillStyle = '#1a1a2e'
    ctx.font = '600 44px Georgia, serif'
    ctx.fillText('CONCORD', w / 2, 170)
    ctx.font = '14px Georgia, serif'
    ctx.fillStyle = '#a8872f'
    ctx.fillText('D E A L   P L A T F O R M', w / 2, 200)

    // body
    ctx.fillStyle = '#7a7a8a'
    ctx.font = '20px Georgia, serif'
    ctx.fillText('Certificate of Completion', w / 2, 300)
    ctx.fillStyle = '#2b2b3a'
    ctx.font = '18px Georgia, serif'
    ctx.fillText('This is to certify that', w / 2, 360)
    ctx.fillStyle = '#1a1a2e'
    ctx.font = '700 42px Georgia, serif'
    ctx.fillText(brokerName, w / 2, 430)
    ctx.fillStyle = '#2b2b3a'
    ctx.font = '18px Georgia, serif'
    ctx.fillText('has successfully completed the module', w / 2, 480)
    ctx.fillStyle = '#a8872f'
    ctx.font = '700 28px Georgia, serif'
    ctx.fillText(moduleTitle, w / 2, 530)
    ctx.fillStyle = '#7a7a8a'
    ctx.font = '16px Georgia, serif'
    ctx.fillText(`Module ${moduleId} · Issued ${date || '—'}`, w / 2, 580)

    // seal
    const cx = w - 180, cy = h - 150
    ctx.beginPath(); ctx.arc(cx, cy, 42, 0, Math.PI * 2)
    ctx.fillStyle = '#c9a84c'; ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '700 14px Georgia, serif'
    ctx.fillText('CONCORD', cx, cy - 2)
    ctx.font = '10px Georgia, serif'
    ctx.fillText('CERTIFIED', cx, cy + 14)

    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `concord-certificate-${(moduleId || 'module').toLowerCase()}.png`
    a.click()
  }

  return (
    <div style={{ textAlign: 'center', padding: '8px 4px' }}>
      {/* On-screen styled certificate */}
      <div
        style={{
          background: 'linear-gradient(135deg, #fbfaf6, #f3efe6)',
          border: '10px solid #c9a84c', boxShadow: 'inset 0 0 0 2px #e0c97e, 0 8px 24px rgba(0,0,0,0.12)',
          borderRadius: 6, padding: '48px 40px', maxWidth: 680, margin: '0 auto 20px',
          position: 'relative',
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, fontFamily: 'Georgia, serif', color: 'var(--navy)', letterSpacing: 2 }}>
          CONCORD
        </div>
        <div style={{ fontSize: 12, letterSpacing: '0.35em', color: 'var(--gold-dark)', marginTop: 2 }}>
          DEAL PLATFORM
        </div>
        <div style={{ height: 2, width: 90, background: 'var(--gold)', margin: '18px auto' }} />
        <div style={{ fontSize: 18, color: 'var(--muted)' }}>Certificate of Completion</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 26 }}>This certifies that</div>
        <div style={{ fontSize: 34, fontWeight: 700, fontFamily: 'Georgia, serif', color: 'var(--navy)', margin: '10px 0' }}>
          {brokerName}
        </div>
        <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 8 }}>has completed</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--gold-dark)', fontFamily: 'Georgia, serif' }}>{moduleTitle}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 26 }}>
          Module {moduleId} {date && `· Issued ${date}`}
        </div>
        {/* seal */}
        <div
          style={{
            position: 'absolute', right: 40, bottom: 40, width: 72, height: 72, borderRadius: '50%',
            background: 'var(--gold)', color: '#fff', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 13 }}>CONCORD</span>
          <span style={{ fontSize: 9, letterSpacing: 1 }}>CERTIFIED</span>
        </div>
      </div>

      <button className="btn" onClick={download}>⬇ Download Certificate (PNG)</button>
    </div>
  )
}
