'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface AudioPlayerProps {
  src: string
  label: string           // "Morning Affirmation" | "Evening Affirmation"
  icon: string            // emoji
  truthStatement?: string // text to highlight word-by-word
  accentColor?: string    // track accent hex
  onComplete?: () => void
}

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// The truth statement appears roughly between 35%–80% of the audio
// (script structure: opening 20%, doubt 20%, reframe 25%, truth×3 30%, closing 5%)
// We animate through the words three times across that window.
function getHighlightedWordIndex(currentTime: number, duration: number, wordCount: number): number {
  if (!duration || !wordCount) return -1
  const progress = currentTime / duration
  if (progress < 0.35 || progress > 0.82) return -1

  // Map 0.35–0.82 range to 3 passes through the word list
  const windowProgress = (progress - 0.35) / 0.47  // 0→1 within the truth window
  const idx = Math.floor(windowProgress * wordCount * 3) % wordCount
  return idx
}

export default function AudioPlayer({
  src,
  label,
  icon,
  truthStatement,
  accentColor = '#C9A84C',
  onComplete,
}: AudioPlayerProps) {
  const audioRef    = useRef<HTMLAudioElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying]       = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]     = useState(0)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(false)

  const words = truthStatement ? truthStatement.split(/\s+/).filter(Boolean) : []
  const activeWord = playing ? getHighlightedWordIndex(currentTime, duration, words.length) : -1

  // Accent colour helpers
  const accentGlow   = accentColor + '22'
  const accentBorder = accentColor + '44'
  const accentFaint  = accentColor + '99'

  function togglePlay() {
    const el = audioRef.current
    if (!el) return
    if (playing) { el.pause() }
    else         { el.play().catch(() => setError(true)) }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = audioRef.current
    if (!el || !duration) return
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    el.currentTime = pct * duration
  }

  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    const onPlay     = () => { setPlaying(true);  setLoading(false) }
    const onPause    = () => setPlaying(false)
    const onWaiting  = () => setLoading(true)
    const onCanPlay  = () => setLoading(false)
    const onTimeUpd  = () => setCurrentTime(el.currentTime)
    const onLoaded   = () => setDuration(el.duration)
    const onEnded    = () => { setPlaying(false); onComplete?.() }
    const onError    = () => setError(true)

    el.addEventListener('play',          onPlay)
    el.addEventListener('pause',         onPause)
    el.addEventListener('waiting',       onWaiting)
    el.addEventListener('canplay',       onCanPlay)
    el.addEventListener('timeupdate',    onTimeUpd)
    el.addEventListener('loadedmetadata', onLoaded)
    el.addEventListener('ended',         onEnded)
    el.addEventListener('error',         onError)
    return () => {
      el.removeEventListener('play',          onPlay)
      el.removeEventListener('pause',         onPause)
      el.removeEventListener('waiting',       onWaiting)
      el.removeEventListener('canplay',       onCanPlay)
      el.removeEventListener('timeupdate',    onTimeUpd)
      el.removeEventListener('loadedmetadata', onLoaded)
      el.removeEventListener('ended',         onEnded)
      el.removeEventListener('error',         onError)
    }
  }, [onComplete])

  const progress = duration ? (currentTime / duration) * 100 : 0

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${accentBorder}`, background: 'rgba(255,255,255,0.03)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4"
        style={{ borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
        <span className="text-2xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{label}</p>
          <p className="text-xs" style={{ color: 'hsl(220,10%,50%)' }}>
            {error ? 'Audio unavailable' : duration ? `${formatTime(duration)} · Full session` : 'Loading…'}
          </p>
        </div>
        {/* Time */}
        <span className="text-xs font-mono tabular-nums" style={{ color: accentFaint }}>
          {formatTime(currentTime)}
        </span>
      </div>

      {/* Synchronized truth text */}
      {words.length > 0 && (
        <div className="px-5 py-4" style={{ background: accentGlow, borderBottom: `1px solid ${accentBorder}` }}>
          <p className="text-xs uppercase tracking-widest mb-2.5" style={{ color: accentColor, opacity: 0.7 }}>
            Today&apos;s Truth
          </p>
          <p className="text-base leading-relaxed font-medium">
            {words.map((word, i) => (
              <span
                key={i}
                style={{
                  color: i === activeWord
                    ? accentColor
                    : i < activeWord || activeWord === -1
                    ? 'hsl(45,20%,75%)'
                    : 'hsl(220,10%,38%)',
                  transition: 'color 0.25s ease, text-shadow 0.25s ease',
                  textShadow: i === activeWord ? `0 0 16px ${accentColor}88` : 'none',
                  marginRight: '0.3em',
                  display: 'inline-block',
                  fontWeight: i === activeWord ? '600' : '400',
                }}
              >
                {word}
              </span>
            ))}
          </p>
        </div>
      )}

      {/* Controls */}
      <div className="px-5 py-4 space-y-3">
        {/* Progress bar */}
        <div
          className="h-1.5 rounded-full cursor-pointer relative"
          style={{ background: 'rgba(255,255,255,0.08)' }}
          onClick={seek}
        >
          <div
            className="h-1.5 rounded-full transition-all duration-100"
            style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${accentColor}, ${accentColor}bb)` }}
          />
          {/* Thumb */}
          {duration > 0 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2"
              style={{
                left: `calc(${progress}% - 6px)`,
                background: accentColor,
                borderColor: 'hsl(222,20%,10%)',
                boxShadow: `0 0 6px ${accentColor}88`,
              }}
            />
          )}
        </div>

        {/* Play / Pause */}
        <div className="flex items-center justify-between">
          {/* Rewind 15s */}
          <button
            onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, currentTime - 15) }}
            className="text-xs px-2 py-1 rounded-lg"
            style={{ color: 'hsl(220,10%,50%)', background: 'rgba(255,255,255,0.04)' }}
            title="Back 15s"
          >
            ↺ 15s
          </button>

          {/* Big play/pause */}
          <button
            onClick={togglePlay}
            disabled={error}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-95"
            style={{
              background: error ? 'rgba(255,255,255,0.05)' : `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
              color: error ? 'hsl(220,10%,40%)' : 'hsl(222,20%,8%)',
              boxShadow: playing ? `0 0 20px ${accentColor}55` : 'none',
            }}
          >
            {loading ? (
              <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
              </svg>
            ) : playing ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1"/>
                <rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.14v14l11-7-11-7z"/>
              </svg>
            )}
          </button>

          {/* Forward 15s */}
          <button
            onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(duration, currentTime + 15) }}
            className="text-xs px-2 py-1 rounded-lg"
            style={{ color: 'hsl(220,10%,50%)', background: 'rgba(255,255,255,0.04)' }}
            title="Forward 15s"
          >
            15s ↻
          </button>
        </div>
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  )
}
