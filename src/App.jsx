import { useState, useRef, useEffect } from 'react'

const pad = (n) => String(n).padStart(2, '0')
const MAX = { h: 99, m: 59, s: 59 }
const LABELS = { h: 'hours', m: 'minutes', s: 'seconds' }
const ALARM_MAX_MS = 30000

function toMs({ h, m, s }) {
  return (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000
}

export default function App() {
  const [fields, setFields] = useState({ h: '00', m: '05', s: '00' })
  const [status, setStatus] = useState('idle') // idle | running | paused | finished
  const [remaining, setRemaining] = useState(0)
  const [total, setTotal] = useState(0)

  const endRef = useRef(0)
  const audioRef = useRef(null)
  const alarmRef = useRef(null)

  /* ---------- Sound ---------- */
  const ensureAudio = () => {
    if (!audioRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (Ctx) audioRef.current = new Ctx()
    }
    audioRef.current?.resume?.()
  }

  const beep = (offset) => {
    const ctx = audioRef.current
    if (!ctx) return
    const t = ctx.currentTime + offset
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.4, t + 0.02)
    gain.gain.linearRampToValueAtTime(0, t + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.2)
  }

  const startAlarm = () => {
    const ring = () => {
      beep(0)
      beep(0.25)
      beep(0.5)
      navigator.vibrate?.([200, 100, 200, 100, 200])
    }
    ring()
    const interval = setInterval(ring, 1500)
    const stopTimeout = setTimeout(stopAlarm, ALARM_MAX_MS)
    alarmRef.current = { interval, stopTimeout }
  }

  const stopAlarm = () => {
    if (!alarmRef.current) return
    clearInterval(alarmRef.current.interval)
    clearTimeout(alarmRef.current.stopTimeout)
    alarmRef.current = null
    navigator.vibrate?.(0)
  }

  useEffect(() => stopAlarm, [])

  /* ---------- Countdown ---------- */
  useEffect(() => {
    if (status !== 'running') return
    const tick = () => {
      const left = endRef.current - Date.now()
      if (left <= 0) {
        setRemaining(0)
        setStatus('finished')
        startAlarm()
      } else {
        setRemaining(left)
      }
    }
    const id = setInterval(tick, 100)
    tick()
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  /* ---------- Derived display ---------- */
  const shown =
    status === 'idle'
      ? fields
      : (() => {
          const secs = Math.ceil(remaining / 1000)
          return {
            h: pad(Math.floor(secs / 3600)),
            m: pad(Math.floor((secs % 3600) / 60)),
            s: pad(secs % 60),
          }
        })()

  useEffect(() => {
    document.title =
      status === 'idle'
        ? 'Timer'
        : status === 'finished'
          ? "Time's up"
          : `${shown.h}:${shown.m}:${shown.s}`
  })

  /* ---------- Actions ---------- */
  const begin = (ms) => {
    ensureAudio()
    stopAlarm()
    setTotal(ms)
    setRemaining(ms)
    endRef.current = Date.now() + ms
    setStatus('running')
  }

  const handlePrimary = () => {
    if (status === 'idle') {
      const ms = toMs(fields)
      if (ms > 0) begin(ms)
    } else if (status === 'running') {
      setRemaining(Math.max(0, endRef.current - Date.now()))
      setStatus('paused')
    } else if (status === 'paused') {
      ensureAudio()
      endRef.current = Date.now() + remaining
      setStatus('running')
    } else if (status === 'finished') {
      begin(total)
    }
  }

  const handleReset = () => {
    stopAlarm()
    setStatus('idle')
    setRemaining(0)
  }

  /* ---------- Inputs ---------- */
  const onChange = (key) => (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(-2)
    setFields((f) => ({ ...f, [key]: digits }))
  }
  const onBlur = (key) => () =>
    setFields((f) => ({ ...f, [key]: pad(Math.min(MAX[key], Number(f[key] || 0))) }))
  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
      handlePrimary()
    }
  }

  const canStart = status !== 'idle' || toMs(fields) > 0
  const primaryLabel = {
    idle: 'Start',
    running: 'Pause',
    paused: 'Resume',
    finished: 'Restart',
  }[status]
  const progress = status === 'idle' || total === 0 ? 1 : remaining / total

  return (
    <main className={`app ${status}`}>
      <p className="status" aria-live="polite">
        {status === 'finished' ? "Time's up" : status === 'paused' ? 'Paused' : '\u00A0'}
      </p>

      <div className="clock" role="timer" aria-label="Countdown">
        {['h', 'm', 's'].map((key, i) => (
          <div className="clock-part" key={key}>
            {i > 0 && <span className="sep" aria-hidden="true">:</span>}
            <div className="unit">
              {status === 'idle' ? (
                <input
                  className="digits"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={fields[key]}
                  onChange={onChange(key)}
                  onBlur={onBlur(key)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={onKeyDown}
                  aria-label={LABELS[key]}
                />
              ) : (
                <span className="digits">{shown[key]}</span>
              )}
              <span className="unit-label">{LABELS[key]}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="progress" aria-hidden="true">
        <div className="progress-fill" style={{ transform: `scaleX(${progress})` }} />
      </div>

      <div className="controls">
        <button className="btn primary" onClick={handlePrimary} disabled={!canStart}>
          {primaryLabel}
        </button>
        <button className="btn" onClick={handleReset} disabled={status === 'idle'}>
          Reset
        </button>
      </div>
    </main>
  )
}
