'use client'

import Link from 'next/link'
import { useState } from 'react'
import '../app.css'

const VERIFY_TOKEN = 'vc-verify=k8sn3p2-9f1a-c402-d7e1-8b3a91f02e44'
const VERIFY_PATH = '/.well-known/vibe-check-verify.txt'

export default function OnboardPage() {
  const [activeTab, setActiveTab] = useState<'dns' | 'file' | 'meta'>('dns')
  const [copied, setCopied] = useState<string | null>(null)

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="onb-top">
        <Link href="/dashboard" className="logo">
          <div className="logo-mark">✓</div>
          <span>Vibe-Check</span>
        </Link>
        <div className="stepper">
          <div className="stepper-step done">
            <div className="step-num">1</div>
            <span>Add URL</span>
          </div>
          <div className="step-line" />
          <div className="stepper-step active">
            <div className="step-num">2</div>
            <span>Verify ownership</span>
          </div>
          <div className="step-line" />
          <div className="stepper-step">
            <div className="step-num">3</div>
            <span style={{ color: 'var(--ink-mute)' }}>Run scan</span>
          </div>
        </div>
        <Link href="/dashboard" className="skip">save &amp; exit ✕</Link>
      </div>

      <div className="onb-wrap onb" style={{ borderBottom: '1px dashed var(--line)', paddingBottom: 32 }}>
        <div className="onb-eyebrow">step 1 of 2 · enter URL</div>
        <h1>What are we checking today?</h1>
        <p className="lede">Drop the URL of the app you want to scan. The deployed one — staging counts if it&apos;s reachable from the public internet.</p>

        <form className="big-input" onSubmit={(e) => e.preventDefault()}>
          <div className="prefix">https://</div>
          <input type="text" placeholder="my-app.vercel.app" autoComplete="off" spellCheck={false} />
          <button type="submit">Continue →</button>
        </form>
        <div className="onb-helper">We&apos;ll verify you own this before scanning. <b>Read-only</b> — we never write to your app or store credentials.</div>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)' }}>
          <span>◯ subdomains: scan separately, count as separate URLs</span>
          <span>◯ localhost / private IPs: not supported</span>
        </div>
      </div>

      <div className="onb-wrap split onb">
        <div>
          <div className="onb-eyebrow">step 2 of 2 · verify ownership</div>
          <h1>Prove this is yours.</h1>
          <p className="lede">Pick whichever is easier. Active scans probe real auth flows — we won&apos;t run those against domains you can&apos;t verify.</p>

          <div className="tabs">
            <div className={`tab${activeTab === 'dns' ? ' active' : ''}`} onClick={() => setActiveTab('dns')}>
              DNS record <span className="badge-tab">faster</span>
            </div>
            <div className={`tab${activeTab === 'file' ? ' active' : ''}`} onClick={() => setActiveTab('file')}>
              File upload
            </div>
            <div className={`tab${activeTab === 'meta' ? ' active' : ''}`} onClick={() => setActiveTab('meta')}>
              Meta tag
            </div>
          </div>

          <div className={`tab-pane${activeTab === 'dns' ? ' active' : ''}`}>
            <div className="verify-block">
              <div className="vlabel">Add this TXT record to your DNS</div>
              <div className="kv"><div className="k">type</div><div className="v">TXT</div></div>
              <div className="kv"><div className="k">host</div><div className="v">_vibecheck.my-app.vercel.app</div></div>
              <div className="kv">
                <div className="k">value</div>
                <div className="v" style={{ display: 'block', width: '100%' }}>
                  <div className="copy-block">
                    <span className="val">{VERIFY_TOKEN}</span>
                    <button onClick={() => copy(VERIFY_TOKEN, 'dns-val')}>{copied === 'dns-val' ? '✓ copied' : 'copy'}</button>
                  </div>
                </div>
              </div>
              <div className="kv"><div className="k">TTL</div><div className="v">300 (or your provider&apos;s minimum)</div></div>
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button className="btn btn-primary" style={{ padding: '10px 14px', fontSize: 13 }}>↻ Check now</button>
                <button className="btn btn-soft" style={{ padding: '10px 14px', fontSize: 13 }}>Open DNS docs</button>
              </div>
            </div>
          </div>

          <div className={`tab-pane${activeTab === 'file' ? ' active' : ''}`}>
            <div className="verify-block">
              <div className="vlabel">Upload a file to your site</div>
              <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--ink-soft)' }}>
                Drop this file into your repo at <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-sub)', padding: '1px 5px', borderRadius: 2, fontSize: 12 }}>/public/.well-known/</code>, then deploy.
              </p>
              <div className="copy-block" style={{ marginBottom: 10 }}>
                <span style={{ color: '#9a9a93' }}>path&nbsp;&nbsp;</span>
                <span className="val">{VERIFY_PATH}</span>
                <button onClick={() => copy(VERIFY_PATH, 'file-path')}>{copied === 'file-path' ? '✓ copied' : 'copy'}</button>
              </div>
              <div className="copy-block">
                <span style={{ color: '#9a9a93' }}>body&nbsp;&nbsp;</span>
                <span className="val">{VERIFY_TOKEN}</span>
                <button onClick={() => copy(VERIFY_TOKEN, 'file-body')}>{copied === 'file-body' ? '✓ copied' : 'copy'}</button>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button className="btn btn-primary" style={{ padding: '10px 14px', fontSize: 13 }}>↻ Check file</button>
                <button className="btn btn-soft" style={{ padding: '10px 14px', fontSize: 13 }}>⇩ Download file</button>
              </div>
            </div>
          </div>

          <div className={`tab-pane${activeTab === 'meta' ? ' active' : ''}`}>
            <div className="verify-block">
              <div className="vlabel">Add a meta tag to your &lt;head&gt;</div>
              <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--ink-soft)' }}>Best for static sites or anywhere editing DNS is a faff.</p>
              <div className="copy-block">
                <span className="val">&lt;meta name=&quot;vibe-check&quot; content=&quot;k8sn3p2-9f1a-c402&quot;&gt;</span>
                <button onClick={() => copy('<meta name="vibe-check" content="k8sn3p2-9f1a-c402">', 'meta')}>{copied === 'meta' ? '✓ copied' : 'copy'}</button>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button className="btn btn-primary" style={{ padding: '10px 14px', fontSize: 13 }}>↻ Check page source</button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="next-list">
            <h3>What happens next</h3>
            <ol>
              <li>
                <span className="nl-num">01</span>
                <div>
                  <b>We pick a scan mode</b>
                  <small>Active for verified URLs, passive only otherwise. You can downgrade in settings.</small>
                </div>
              </li>
              <li>
                <span className="nl-num">02</span>
                <div>
                  <b>180 checks run in parallel</b>
                  <small>From ~5 outbound IPs we publish in the trust page. Add them to allowlists if you have a WAF.</small>
                </div>
              </li>
              <li>
                <span className="nl-num">03</span>
                <div>
                  <b>Report lands in ~60 seconds</b>
                  <small>Grade, findings, prioritized fix list. Email you when done.</small>
                </div>
              </li>
              <li>
                <span className="nl-num">04</span>
                <div>
                  <b>You decide what&apos;s badge-worthy</b>
                  <small>Free reports are private. Paid reports get a public link and the badge snippet.</small>
                </div>
              </li>
            </ol>
            <div className="pill-info">
              Most providers update instantly. Cloudflare, Vercel, Porkbun, Namecheap have all worked in &lt;60s for the last 1,000 verifications.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
