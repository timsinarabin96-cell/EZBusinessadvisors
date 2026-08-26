import Link from 'next/link'

/** Public "CBI Certified" trust badge — the marketing moat. */
export default function CbiBadge({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const fontSize = size === 'lg' ? 14 : size === 'sm' ? 11 : 12.5
  const padding = size === 'lg' ? '8px 16px' : size === 'sm' ? '3px 9px' : '5px 12px'
  return (
    <Link
      href="/marketplace/certified"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding,
        borderRadius: 999,
        background: 'linear-gradient(120deg, #f7e9c3, #e9cf8f)',
        border: '1px solid #d9b96a',
        color: '#6b4e0a',
        fontWeight: 800,
        fontSize,
        letterSpacing: '0.02em',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
      title="Completed the full CBI training program — verifiable certificate"
    >
      🎓 CBI Certified
    </Link>
  )
}
