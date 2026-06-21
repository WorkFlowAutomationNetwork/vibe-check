import type { CSSProperties } from 'react'

export const metadata = { title: 'Coming soon' }

type SearchParams = { error?: string; notify?: string }

const wrap: CSSProperties = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font-display)', padding: '24px',
}
const card: CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
  boxShadow: '6px 6px 0 var(--ink)', padding: '40px', width: '100%', maxWidth: '440px',
}
const input: CSSProperties = {
  width: '100%', padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
  fontFamily: 'var(--font-mono)', fontSize: '14px', marginBottom: '12px', background: 'var(--bg)',
}
const button: CSSProperties = {
  width: '100%', padding: '12px 14px', border: 'none', borderRadius: 'var(--radius)',
  background: 'var(--violet)', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 600,
  cursor: 'pointer',
}
const divider: CSSProperties = {
  border: 'none', borderTop: '1px solid var(--line)', margin: '28px 0 20px',
}

export default function PrelaunchPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main style={wrap}>
      <div style={card}>
        <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--violet-deep)', letterSpacing: '0.08em', margin: 0 }}>
          VIBE-CHECK
        </p>
        <h1 style={{ fontSize: '28px', margin: '8px 0 4px' }}>Coming soon</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 0 }}>Developer access only.</p>

        <form action="/api/prelaunch/unlock" method="post">
          <input style={input} type="password" name="password" placeholder="Access password" autoComplete="off" required />
          {searchParams.error === '1' && (
            <p style={{ color: 'var(--danger)', fontSize: '13px', marginTop: 0 }}>Incorrect password</p>
          )}
          <button style={button} type="submit">Enter</button>
        </form>

        <hr style={divider} />

        {searchParams.notify === 'ok' ? (
          <p style={{ color: 'var(--violet-deep)', margin: 0 }}>
            You&apos;re on the list — we&apos;ll email you at launch.
          </p>
        ) : (
          <form action="/api/prelaunch/notify" method="post">
            <p style={{ color: 'var(--ink-soft)', marginTop: 0, fontSize: '14px' }}>Get notified when we launch</p>
            <input style={input} type="email" name="email" placeholder="you@example.com" required />
            {searchParams.notify === 'invalid' && (
              <p style={{ color: 'var(--danger)', fontSize: '13px', marginTop: 0 }}>Enter a valid email</p>
            )}
            <button style={{ ...button, background: 'var(--ink)' }} type="submit">Notify me</button>
          </form>
        )}
      </div>
    </main>
  )
}
