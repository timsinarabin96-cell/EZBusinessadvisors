// Root loading state — branded, shown during route transitions.
export default function RootLoading() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', border: '3px solid rgba(201,168,76,0.25)', borderTopColor: '#c9a84c', margin: '0 auto 14px', animation: 'spin 0.9s linear infinite' }} />
        <div style={{ fontSize: 12.5, color: 'var(--muted, #888)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Loading…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}
