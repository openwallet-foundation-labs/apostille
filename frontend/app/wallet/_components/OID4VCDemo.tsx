'use client'
import React, { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Icon, ICON_PATHS } from '@/app/components/ui/Icons'
import { demoApi } from '@/lib/api'
import './demo.css'

type IconName = keyof typeof ICON_PATHS
type FormatKey = 'sd-jwt' | 'obv3' | 'ldp-vc' | 'jwt-vc' | 'mdl'
type Tone = 'indigo' | 'green' | 'amber' | 'violet' | 'red'

interface CatalogItem {
  /** Backend credential type id (e.g. 'StudentID', 'mDL') — passed to demoApi. */
  id: string
  name: string
  icon: IconName
  tone: Tone
  issuer: string
  issue: string      // copy shown on the card in Issue mode
  verify: string     // copy shown on the card in Verify mode
  cardSubtitle: string  // wallet-card foot label
  cardSubtitleKey: string  // which attrs entry to use for the foot value
  attrs: Array<[string, string]>  // sample [key, value] pairs for the phone preview
}

interface CatalogGroup {
  key: FormatKey
  label: string
  short: string
  icon: IconName
  items: CatalogItem[]
}

const CATALOG: CatalogGroup[] = [
  {
    key: 'sd-jwt', label: 'SD-JWT', short: 'SD-JWT VC', icon: 'shield',
    items: [
      {
        id: 'StudentID', name: 'Student ID', icon: 'scroll', tone: 'indigo',
        issuer: 'Digital University', issue: 'University student identification card',
        verify: 'Prove university enrolment',
        cardSubtitle: 'Student no.', cardSubtitleKey: 'student_id',
        attrs: [['given_name', 'Alice'], ['family_name', 'Johnson'], ['student_id', 'S1234567890'], ['university', 'Digital University']]
      },
      {
        id: 'ProfessionalLicense', name: 'Professional License', icon: 'fileCheck', tone: 'amber',
        issuer: 'State Bar Association', issue: 'State bar association lawyer license',
        verify: 'Prove active professional license',
        cardSubtitle: 'License no.', cardSubtitleKey: 'license_number',
        attrs: [['given_name', 'Joyce'], ['family_name', 'Smith'], ['license_number', 'L-987654321'], ['profession', 'Lawyer']]
      },
      {
        id: 'EmployeeBadge', name: 'Employee Badge', icon: 'badge', tone: 'indigo',
        issuer: 'Tech Corp', issue: 'Corporate employee identification',
        verify: 'Prove employer & active employment',
        cardSubtitle: 'Employee ID', cardSubtitleKey: 'employee_id',
        attrs: [['given_name', 'Bob'], ['family_name', 'Williams'], ['employee_id', 'E-554433'], ['department', 'Engineering']]
      },
      {
        id: 'HealthInsurance', name: 'Health Insurance', icon: 'shieldCheck', tone: 'red',
        issuer: 'Global Care Provider', issue: 'Global care provider member card',
        verify: 'Prove active health coverage',
        cardSubtitle: 'Member no.', cardSubtitleKey: 'member_id',
        attrs: [['given_name', 'Charlie'], ['family_name', 'Brown'], ['member_id', 'M-11223344'], ['plan_name', 'Premium Health']]
      },
      {
        id: 'LoyaltyMembership', name: 'Loyalty Membership', icon: 'award', tone: 'amber',
        issuer: 'SkyHigh Rewards', issue: 'SkyHigh rewards gold tier membership',
        verify: 'Prove gold tier or higher',
        cardSubtitle: 'Tier', cardSubtitleKey: 'tier',
        attrs: [['given_name', 'Diana'], ['family_name', 'Prince'], ['tier', 'Gold'], ['points', '15400']]
      },
      {
        id: 'AgeVerification', name: 'Age Verification', icon: 'user', tone: 'green',
        issuer: 'Government Records', issue: 'Proof of age and nationality',
        verify: 'Prove age ≥ 21 without revealing DOB',
        cardSubtitle: 'Status', cardSubtitleKey: 'over_21',
        attrs: [['given_name', 'Eve'], ['family_name', 'Adams'], ['over_21', 'true'], ['over_18', 'true']]
      },
    ],
  },
  {
    key: 'obv3', label: 'OBV3', short: 'Open Badges', icon: 'award',
    items: [
      {
        id: 'AcademicExcellence', name: 'Academic Excellence', icon: 'award', tone: 'amber',
        issuer: 'Digital University', issue: "Dean's List for Academic Excellence",
        verify: "Prove Dean's List status",
        cardSubtitle: 'Type', cardSubtitleKey: 'achievementType',
        attrs: [['name', 'Dean\'s List'], ['achievementType', 'Award'], ['institution', 'Digital University']]
      },
      {
        id: 'SkillsCertification', name: 'Skills Certification', icon: 'fileCheck', tone: 'violet',
        issuer: 'Cloud Native Foundation', issue: 'Cloud Computing Specialist',
        verify: 'Prove cloud certification',
        cardSubtitle: 'Level', cardSubtitleKey: 'level',
        attrs: [['skill', 'Cloud Computing'], ['level', 'Specialist'], ['issuedOn', '2025-02-14']]
      },
      {
        id: 'CourseCompletion', name: 'Course Completion', icon: 'checkCircle', tone: 'green',
        issuer: 'Coursera', issue: 'Introduction to Web Development',
        verify: 'Prove course completion',
        cardSubtitle: 'Completed', cardSubtitleKey: 'completedOn',
        attrs: [['course', 'Intro to Web Dev'], ['completedOn', '2024-11-20'], ['score', '98%']]
      },
      {
        id: 'AcademicEndorsement', name: 'Academic Endorsement', icon: 'shieldCheck', tone: 'indigo',
        issuer: 'Independent Faculty', issue: 'Third-party endorsement of an existing credential',
        verify: 'Prove holder has an academic endorsement',
        cardSubtitle: 'Endorser', cardSubtitleKey: 'endorser',
        attrs: [['endorser', 'Independent Faculty Review Board'], ['subject', 'Academic Excellence'], ['relationship', 'Reviewer']]
      },
      {
        id: 'Diploma', name: 'BSc Diploma', icon: 'graduationCap', tone: 'amber',
        issuer: 'Digital University', issue: 'Bachelor of Science in Computer Science — Magna Cum Laude',
        verify: 'Prove holder has a CS diploma',
        cardSubtitle: 'Conferred', cardSubtitleKey: 'date_conferred',
        attrs: [['name', 'Alice Johnson'], ['student_id', 'STU-2020-4451'], ['achievement', 'BSc Computer Science'], ['date_conferred', '2024-05-17']]
      },
    ],
  },
  {
    key: 'ldp-vc', label: 'LDP-VC', short: 'JSON-LD VC', icon: 'scroll',
    items: [
      {
        id: 'AlumniCredential', name: 'Alumni Credential', icon: 'graduationCap', tone: 'green',
        issuer: 'Digital University', issue: 'JSON-LD alumni credential (eddsa-rdfc-2022)',
        verify: 'Prove alumni status',
        cardSubtitle: 'Class of', cardSubtitleKey: 'graduation_year',
        attrs: [['given_name', 'Alice'], ['degree', 'BS Computer Science'], ['alma_mater', 'Digital University'], ['graduation_year', '2024']]
      },
      {
        id: 'VolunteerCertificate', name: 'Volunteer Certificate', icon: 'fileCheck', tone: 'green',
        issuer: 'Open Source Foundation', issue: 'JSON-LD volunteer-hours certificate',
        verify: 'Prove ≥ 40 volunteer hours',
        cardSubtitle: 'Hours', cardSubtitleKey: 'hours_contributed',
        attrs: [['organization', 'Open Source Foundation'], ['role', 'Maintainer'], ['hours_contributed', '120']]
      },
    ],
  },
  {
    key: 'jwt-vc', label: 'JWT-VC', short: 'W3C JWT VC', icon: 'fileSig',
    items: [
      {
        id: 'EventTicket', name: 'Event Ticket', icon: 'calendar', tone: 'amber',
        issuer: 'Identity Summit', issue: 'Conference admission ticket signed as JWT VC',
        verify: 'Prove ticket validity at entry',
        cardSubtitle: 'Seat', cardSubtitleKey: 'seat',
        attrs: [['event_name', 'Identity Summit 2026'], ['venue', 'Berlin'], ['seat', 'GA-1042'], ['event_date', '2026-09-14']]
      },
      {
        id: 'ResearchAttestation', name: 'Research Attestation', icon: 'fileSig', tone: 'violet',
        issuer: 'Independent Research Lab', issue: 'JSON-LD researcher attestation wrapped in a JWT',
        verify: 'Prove research affiliation',
        cardSubtitle: 'Area', cardSubtitleKey: 'project',
        attrs: [['institution', 'Independent Research Lab'], ['role', 'Principal Investigator'], ['project', 'VC Field Study']]
      },
    ],
  },
  {
    key: 'mdl', label: 'mDL', short: 'Mobile Document', icon: 'cards',
    items: [
      {
        id: 'mDL', name: "Mobile Driver's License", icon: 'idCard', tone: 'indigo',
        issuer: 'Department of Motor Vehicles', issue: 'ISO 18013-5 compliant mDL',
        verify: 'Prove driving privileges and age',
        cardSubtitle: 'License no.', cardSubtitleKey: 'document_number',
        attrs: [['given_name', 'Alice'], ['family_name', 'Johnson'], ['document_number', 'DL-9381472'], ['birth_date', '1990-07-15']]
      },
    ],
  },
]

function formatAttrLabel(k: string): string {
  return k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase())
}

function shortValue(v: string): string {
  const s = String(v)
  return s.length > 22 ? s.slice(0, 22) + '…' : s
}

function cardFootValue(item: CatalogItem): string {
  const found = item.attrs.find(([k]) => k === item.cardSubtitleKey)
  return shortValue(found ? found[1] : item.attrs[0][1])
}

/** Backend status string → 0..3 pipeline stage. */
function issueStatusToStage(status: string | undefined): number {
  switch (status) {
    case 'pending': return 0
    case 'token_issued': return 1
    case 'credential_request_received': return 2
    case 'credential_issued': return 3
    default: return 0
  }
}
function verifyStatusToStage(status: string | undefined): number {
  switch (status) {
    case 'RequestCreated':
    case 'pending':
      return 0
    case 'ResponseReceived':
      return 2
    case 'ResponseVerified':
      return 3
    default: return 0
  }
}

const ISSUE_STAGES = [
  { label: 'Waiting for scan' },
  { label: 'Wallet scanned' },
  { label: 'Adding to wallet' },
  { label: 'Issued' },
]
const VERIFY_STAGES = [
  { label: 'Waiting for scan' },
  { label: 'Wallet scanned' },
  { label: 'Presenting' },
  { label: 'Verified' },
]

export default function OID4VCDemo() {
  const [mode, setMode] = useState<'issue' | 'verify'>('issue')
  const [fmtKey, setFmtKey] = useState<FormatKey>('sd-jwt')
  const [selectedByFmt, setSelectedByFmt] = useState<Record<FormatKey, string>>({
    'sd-jwt': 'StudentID',
    'obv3': 'AcademicExcellence',
    'ldp-vc': 'AlumniCredential',
    'jwt-vc': 'EventTicket',
    'mdl': 'mDL',
  })
  const [recipientName, setRecipientName] = useState('Alice Johnson')

  const [activeOffer, setActiveOffer] = useState<{
    credentialType: string
    uri: string
    id: string
    status: string
    loading: boolean
    error: string | null
  } | null>(null)

  const [activeVerification, setActiveVerification] = useState<{
    credentialType: string
    uri: string
    sessionId: string
    status: string
    loading: boolean
    error: string | null
    verifiedClaims: Record<string, any> | null
  } | null>(null)

  // Hidden from Verify until upstream support stabilizes:
  // - mdl: ISO 18013-7 requires `direct_post.jwt` (encrypted JWE response) for
  //   any OID4VP request containing mdoc. Credo's verifier hard-rejects plain
  //   `direct_post` for mdoc. Bifold's encrypted-response code path fails
  //   after building the mdoc VP.
  // - jwt-vc: bifold's older Sphereon SIOP throws "SIOP spec version could
  //   not inferred from the authentication request payload" on our signed
  //   request_uri JWT for the JWT-VC flow specifically.
  const HIDDEN_IN_VERIFY: ReadonlyArray<FormatKey> = ['mdl', 'jwt-vc']
  const visibleCatalog = mode === 'verify'
    ? CATALOG.filter(g => !HIDDEN_IN_VERIFY.includes(g.key))
    : CATALOG
  const safeFmtKey: FormatKey = visibleCatalog.some(g => g.key === fmtKey)
    ? fmtKey
    : visibleCatalog[0].key
  const group = CATALOG.find(g => g.key === safeFmtKey)!
  const selectedItemId = selectedByFmt[safeFmtKey]
  const selectedItem = group.items.find(i => i.id === selectedItemId) ?? group.items[0]

  const handleIssue = async (credentialType: string) => {
    setActiveOffer({ credentialType, uri: '', id: '', status: 'pending', loading: true, error: null })
    try {
      const r = await demoApi.createOid4vcOffer(credentialType, recipientName)
      if (r.success) {
        setActiveOffer({ credentialType, uri: r.offerUri, id: r.offerId, status: 'pending', loading: false, error: null })
      } else {
        throw new Error(r.error_description || 'Failed to create offer')
      }
    } catch (e: any) {
      setActiveOffer(prev => prev ? { ...prev, loading: false, error: e.message || 'Error connecting to server' } : null)
    }
  }

  const handleVerify = async (credentialType: string) => {
    setActiveVerification({ credentialType, uri: '', sessionId: '', status: 'RequestCreated', loading: true, error: null, verifiedClaims: null })
    try {
      const r = await demoApi.createVerificationRequest(credentialType)
      if (r.success) {
        setActiveVerification({
          credentialType, uri: r.authorizationRequestUri, sessionId: r.sessionId,
          status: 'RequestCreated', loading: false, error: null, verifiedClaims: null,
        })
      } else {
        throw new Error(r.error_description || 'Failed to create verification request')
      }
    } catch (e: any) {
      setActiveVerification(prev => prev ? { ...prev, loading: false, error: e.message || 'Error connecting to server' } : null)
    }
  }

  // Auto-kick request whenever the selection or mode changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode === 'issue') {
      setActiveVerification(null)
      handleIssue(selectedItem.id)
    } else {
      setActiveOffer(null)
      handleVerify(selectedItem.id)
    }
  }, [mode, fmtKey, selectedItem.id])

  // Poll issuance status
  useEffect(() => {
    if (!activeOffer || !activeOffer.id || activeOffer.status === 'credential_issued' || activeOffer.error) return
    const t = setInterval(async () => {
      try {
        const r = await demoApi.getOid4vcOfferStatus(activeOffer.id)
        if (r.success && r.status !== activeOffer.status) {
          setActiveOffer(prev => prev ? { ...prev, status: r.status } : null)
        }
      } catch (_e) { /* ignore */ }
    }, 2000)
    return () => clearInterval(t)
  }, [activeOffer])

  // Poll verification status
  useEffect(() => {
    if (
      !activeVerification ||
      !activeVerification.sessionId ||
      activeVerification.status === 'ResponseVerified' ||
      activeVerification.error
    ) return
    const t = setInterval(async () => {
      try {
        const r = await demoApi.getVerificationStatus(activeVerification.sessionId)
        if (r.success && (r.status !== activeVerification.status || r.verifiedClaims)) {
          setActiveVerification(prev => prev
            ? { ...prev, status: r.status, verifiedClaims: r.verifiedClaims ?? prev.verifiedClaims }
            : null)
        }
      } catch (_e) { /* ignore */ }
    }, 2000)
    return () => clearInterval(t)
  }, [activeVerification])

  const initials = recipientName.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()

  const restart = () => {
    if (mode === 'issue') handleIssue(selectedItem.id)
    else handleVerify(selectedItem.id)
  }

  const currentUri = mode === 'issue' ? activeOffer?.uri || '' : activeVerification?.uri || ''
  const currentLoading = mode === 'issue' ? !!activeOffer?.loading : !!activeVerification?.loading
  const currentError = mode === 'issue' ? activeOffer?.error : activeVerification?.error
  const stage = mode === 'issue'
    ? issueStatusToStage(activeOffer?.status)
    : verifyStatusToStage(activeVerification?.status)

  return (
    <div className="demo-shell">
      <header className="demo-head">
        <div className="demo-brand">
          <div className="demo-brand-mark"><Icon name="cards" /></div>
          <div className="demo-brand-name">ESSI Showcase</div>
        </div>

        <div className="mode-toggle">
          <button className={'mode-btn' + (mode === 'issue' ? ' active' : '')} onClick={() => setMode('issue')}>
            <Icon name="send" /> Issue
          </button>
          <button className={'mode-btn' + (mode === 'verify' ? ' active' : '')} onClick={() => setMode('verify')}>
            <Icon name="shieldCheck" /> Verify
          </button>
        </div>

        <div className="demo-user">
          <div className="demo-user-l">
            <div className="demo-user-eyebrow">{mode === 'issue' ? 'Issue to' : 'Verifying'}</div>
            <input
              className="demo-user-name"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', textAlign: 'right', width: '120px' }}
            />
          </div>
          <div className="avatar">{initials || 'AJ'}</div>
        </div>
      </header>

      <div className="demo-body">
        <div className="demo-left">
          <div className="fmt-chips">
            {visibleCatalog.map(g => (
              <button
                key={g.key}
                className={'fmt-chip' + (safeFmtKey === g.key ? ' active' : '')}
                onClick={() => setFmtKey(g.key)}
              >
                <Icon name={g.icon} />
                {g.short}
                <span className="fmt-chip-count">{g.items.length}</span>
              </button>
            ))}
          </div>

          <div className="card-grid">
            {group.items.map(item => (
              <button
                key={item.id}
                className={'cc tone-' + item.tone + (selectedItemId === item.id ? ' active' : '')}
                onClick={() => setSelectedByFmt({ ...selectedByFmt, [fmtKey]: item.id })}
              >
                <div className="cc-icon"><Icon name={item.icon} /></div>
                <div className="cc-body">
                  <div className="cc-name">{item.name}</div>
                  <div className="cc-desc">{mode === 'issue' ? item.issue : item.verify}</div>
                </div>
                <span className="cc-check"><Icon name="check" /></span>
              </button>
            ))}
          </div>
        </div>

        <Rail
          mode={mode}
          item={selectedItem}
          fmtLabel={group.label}
          stage={stage}
          uri={currentUri}
          loading={currentLoading}
          error={currentError}
          verifiedClaims={activeVerification?.verifiedClaims ?? null}
          onRestart={restart}
        />
      </div>
    </div>
  )
}

interface RailProps {
  mode: 'issue' | 'verify'
  item: CatalogItem
  fmtLabel: string
  stage: number
  uri: string
  loading: boolean
  error: string | null | undefined
  verifiedClaims: Record<string, any> | null
  onRestart: () => void
}

function Rail({ mode, item, fmtLabel, stage, uri, loading, error, verifiedClaims, onRestart }: RailProps) {
  const stages = mode === 'issue' ? ISSUE_STAGES : VERIFY_STAGES

  return (
    <aside className="demo-right">
      <div className="rail-top">
        <div className="rail-top-l">
          <div className="rail-eyebrow">
            <Icon name={mode === 'issue' ? 'send' : 'shieldCheck'} />
            {mode === 'issue' ? 'OID4VCI · Credential Offer' : 'OID4VP · Presentation Request'}
          </div>
          <div className="rail-title">{mode === 'issue' ? item.name : `Verify ${item.name}`}</div>
        </div>
      </div>

      <div className="stage">
        {loading ? (
          <div className="qr-stage">
            <div className="qr-waiting"><span className="qr-waiting-dot" /> Building request</div>
            <div className="qr-big" style={{ background: 'var(--bg-elev)' }}>
              <div style={{
                width: 48, height: 48, border: '4px solid var(--border)',
                borderTopColor: 'var(--accent)', borderRadius: '50%',
                animation: 'demoSpin 0.9s linear infinite',
              }} />
            </div>
          </div>
        ) : error ? (
          <div className="qr-stage">
            <div className="qr-caption">
              <div className="qr-caption-title" style={{ color: 'var(--red-ink)' }}>Request failed</div>
              <div className="qr-caption-sub" style={{ maxWidth: 280 }}>{error}</div>
            </div>
            <button className="demo-btn primary" onClick={onRestart} style={{ width: 140, flex: 'none' }}>
              <Icon name="refresh" /> Try again
            </button>
          </div>
        ) : stage === 0 ? (
          <div className="qr-stage">
            <div className="qr-waiting">
              <span className="qr-waiting-dot" /> Waiting for wallet scan
            </div>
            <div className="qr-big">
              {uri ? <QRCodeSVG value={uri} size={248} level="M" includeMargin={false} /> : null}
              <div className="qr-big-badge"><Icon name={mode === 'issue' ? 'shieldCheck' : 'qr'} /></div>
            </div>
            <div className="qr-caption">
              <div className="qr-caption-title">
                {mode === 'issue' ? `Scan to receive ${item.name}` : `Scan to share ${item.name}`}
              </div>
              <div className="qr-caption-sub">
                {mode === 'issue'
                  ? 'Use any OID4VCI-compatible wallet on your phone. The credential will be added once you confirm.'
                  : `Use the wallet that holds your ${item.name}. You'll be asked to approve disclosures.`}
              </div>
            </div>
          </div>
        ) : (
          <div className="phone-stage" key={'phone-' + stage}>
            <div className="phone">
              <div className="phone-screen">
                <div className="phone-notch" />
                {mode === 'issue'
                  ? <PhoneIssueFlow item={item} fmt={fmtLabel} stage={stage} />
                  : <PhoneVerifyFlow item={item} fmt={fmtLabel} stage={stage} verifiedClaims={verifiedClaims} />}
                <div className="home-indicator" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rail-footer">
        <div className="step-pipeline">
          {stages.map((_, i) => (
            <React.Fragment key={i}>
              <div className={'sp-dot ' + (i < stage ? 'done' : i === stage ? 'active' : '')}>
                {i < stage ? <Icon name="check" /> : null}
              </div>
              {i < stages.length - 1 && (
                <div className={'sp-line ' + (i < stage ? 'done' : '')} />
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="sp-label-row">
          <span className="sp-label">{stages[stage]?.label || stages[0].label}</span>
          <span className="sp-time">step {Math.max(stage, 0) + 1} of {stages.length}</span>
        </div>
        <div className="rail-actions">
          <button
            className="demo-btn"
            onClick={() => uri && navigator.clipboard.writeText(uri)}
            disabled={!uri}
          >
            <Icon name="copy" /> Copy link
          </button>
          <button className="demo-btn primary" onClick={onRestart}>
            <Icon name="refresh" /> Restart
          </button>
        </div>
      </div>
    </aside>
  )
}

/* ===== Phone preview (decorative — pairs real status with sample data) ===== */

interface PhoneFlowProps {
  item: CatalogItem
  fmt: string
  stage: number
  verifiedClaims?: Record<string, any> | null
}

function PhoneIssueFlow({ item, fmt, stage }: PhoneFlowProps) {
  const isDone = stage >= 3
  return (
    <>
      <div className="phone-status">
        <span>9:41</span>
        <span className="phone-status-r"><Icon name="globe" /></span>
      </div>
      <div className="phone-content">
        <div className="wallet-header">
          <div className="wallet-name">ESSI Wallet</div>
          <button className="wallet-close"><Icon name="search" /></button>
        </div>

        <div className="wallet-banner">
          <div className={'wallet-banner-icon ' + (isDone ? 'green' : 'indigo')}>
            <Icon name={isDone ? 'checkCircle' : 'send'} />
          </div>
          <div className="wallet-banner-text">
            <div className="wallet-banner-l">{isDone ? 'Added to wallet' : 'Credential offer'}</div>
            <div className="wallet-banner-v">{item.issuer}</div>
          </div>
        </div>

        <WalletCard item={item} fmt={fmt} />

        <div className="claims">
          {item.attrs.slice(0, 3).map(([k, v], i) => (
            <div className="claim" key={k}>
              <span className="claim-l">{formatAttrLabel(k)}</span>
              <span className="claim-v">{shortValue(v)}</span>
              {stage >= 2 && i < stage
                ? <span className="claim-check"><Icon name="check" /></span>
                : null}
            </div>
          ))}
        </div>

        <div className="phone-action">
          {stage === 1 && <button className="phone-btn"><Icon name="check" /> Accept</button>}
          {stage === 2 && <button className="phone-btn"><span className="spinner" /> Adding…</button>}
          {stage >= 3 && <button className="phone-btn success"><Icon name="check" /> Added to wallet</button>}
        </div>
      </div>
    </>
  )
}

function PhoneVerifyFlow({ item, fmt, stage, verifiedClaims }: PhoneFlowProps) {
  const isDone = stage >= 3
  const banner =
    stage === 1 ? 'Review disclosures' :
      stage === 2 ? 'Presenting…' :
        'Sent successfully'

  // Prefer real verified claims when available; fall back to sample attrs.
  const renderedAttrs: Array<[string, string]> = isDone && verifiedClaims
    ? Object.entries(verifiedClaims)
      .filter(([k]) => !k.startsWith('__'))
      .slice(0, 3)
      .map(([k, v]): [string, string] => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])
    : item.attrs.slice(0, 3)

  return (
    <>
      <div className="phone-status">
        <span>9:41</span>
        <span className="phone-status-r"><Icon name="globe" /></span>
      </div>
      <div className="phone-content">
        <div className="wallet-header">
          <div className="wallet-name">ESSI Wallet</div>
          <button className="wallet-close"><Icon name="search" /></button>
        </div>

        <div className="wallet-banner">
          <div className={'wallet-banner-icon ' + (isDone ? 'green' : 'indigo')}>
            <Icon name={isDone ? 'checkCircle' : 'shieldCheck'} />
          </div>
          <div className="wallet-banner-text">
            <div className="wallet-banner-l">{banner}</div>
            <div className="wallet-banner-v">Verifier · essi.studio</div>
          </div>
        </div>

        <WalletCard item={item} fmt={fmt} />

        <div className="claims">
          {renderedAttrs.map(([k, v], i) => (
            <div className="claim" key={k + '-' + i}>
              <span className="claim-l">{formatAttrLabel(k)}</span>
              <span className="claim-v">{stage >= 2 ? shortValue(v) : '—'}</span>
              {stage >= 2 ? <span className="claim-check"><Icon name="check" /></span> : null}
            </div>
          ))}
        </div>

        <div className="phone-action">
          {stage === 1 && <button className="phone-btn"><Icon name="eye" /> Review & approve</button>}
          {stage === 2 && <button className="phone-btn"><span className="spinner" /> Presenting</button>}
          {stage >= 3 && <button className="phone-btn success"><Icon name="check" /> Verified</button>}
        </div>
      </div>
    </>
  )
}

function WalletCard({ item, fmt }: { item: CatalogItem; fmt: string }) {
  return (
    <div className={'wcard ' + item.tone}>
      <div className="wcard-h">
        <div>
          <div className="wcard-issuer">{item.issuer}</div>
          <div className="wcard-name">{item.name}</div>
        </div>
        <div className="wcard-fmt">{fmt}</div>
      </div>
      <div className="wcard-foot">
        <div className="wcard-foot-l">
          <div className="wcard-foot-label">{item.cardSubtitle}</div>
          <div className="wcard-foot-val">{cardFootValue(item)}</div>
        </div>
        <div className="wcard-chip" />
      </div>
    </div>
  )
}

