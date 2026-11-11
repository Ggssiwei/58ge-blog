'use client'

import { useEffect, useRef, useState } from 'react'

type ApiStatus = 'checking' | 'available' | 'unavailable'

type DrawElementFn = (element: Element, dx: number, dy: number) => DOMMatrix | void

type Canvas2DWithElementDraw = CanvasRenderingContext2D & {
  drawElementImage?: DrawElementFn
  drawElement?: DrawElementFn
}

type CanvasWithPaint = HTMLCanvasElement & {
  onpaint: ((this: HTMLCanvasElement) => void) | null
  requestPaint?: () => void
}

function detectHtmlInCanvas() {
  if (typeof document === 'undefined') return false
  const probe = document.createElement('canvas')
  const ctx = probe.getContext('2d') as Canvas2DWithElementDraw | null
  if (!ctx) return false
  return typeof ctx.drawElementImage === 'function' || typeof ctx.drawElement === 'function'
}

export default function HtmlInCanvasHelloWorld() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<ApiStatus>('checking')
  const [text, setText] = useState("Hello, I'm 58Ge!")
  const [copies, setCopies] = useState(12)
  const [speed, setSpeed] = useState(100)

  const copiesRef = useRef(copies)
  const speedRef = useRef(speed)
  copiesRef.current = copies
  speedRef.current = speed

  useEffect(() => {
    const available = detectHtmlInCanvas()
    setStatus(available ? 'available' : 'unavailable')
    if (!available) return

    const canvas = canvasRef.current as CanvasWithPaint | null
    const content = contentRef.current
    const stage = stageRef.current
    if (!canvas || !content || !stage) return

    canvas.setAttribute('layoutsubtree', '')

    const ctx = canvas.getContext('2d') as Canvas2DWithElementDraw | null
    if (!ctx) {
      setStatus('unavailable')
      return
    }

    const drawElementInto = ctx.drawElementImage?.bind(ctx) ?? ctx.drawElement?.bind(ctx) ?? null
    if (!drawElementInto) {
      setStatus('unavailable')
      return
    }

    let mouseX = 0.5
    let mouseY = 0.5
    let targetX = 0.5
    let targetY = 0.5
    let phase = 0
    let lastFrame = performance.now()
    let rafId = 0
    let disposed = false

    const onPointerMove = (e: PointerEvent) => {
      const rect = stage.getBoundingClientRect()
      targetX = (e.clientX - rect.left) / rect.width
      targetY = (e.clientY - rect.top) / rect.height
    }
    window.addEventListener('pointermove', onPointerMove)

    canvas.onpaint = () => {
      const cssW = canvas.width
      const cssH = canvas.height
      if (!cssW || !cssH) return

      mouseX += (targetX - mouseX) * 0.08
      mouseY += (targetY - mouseY) * 0.08

      ctx.reset()
      ctx.fillStyle = 'rgba(7, 7, 13, 0.22)'
      ctx.fillRect(0, 0, cssW, cssH)

      const rect = content.getBoundingClientRect()
      const halfW = rect.width / 2
      const halfH = rect.height / 2
      const cx = cssW / 2
      const cy = cssH / 2
      const offsetX = (mouseX - 0.5) * cssW * 0.18
      const offsetY = (mouseY - 0.5) * cssH * 0.18
      const radius = Math.min(cssW, cssH) * 0.32
      const currentCopies = copiesRef.current

      for (let i = 0; i < currentCopies; i++) {
        const t = i / currentCopies
        const angle = phase + t * Math.PI * 2
        const px = cx + offsetX + Math.cos(angle) * radius
        const py = cy + offsetY + Math.sin(angle) * radius * 0.55
        const depth = (Math.sin(angle) + 1) / 2
        const scale = 0.35 + depth * 0.65

        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(angle + Math.PI / 2)
        ctx.scale(scale, scale)
        ctx.globalAlpha = 0.25 + depth * 0.75
        drawElementInto(content, -halfW, -halfH)
        ctx.restore()
      }

      ctx.save()
      ctx.translate(cx + offsetX * 0.4, cy + offsetY * 0.4)
      ctx.scale(1.2, 1.2)
      ctx.globalAlpha = 1
      const heroTransform = drawElementInto(content, -halfW, -halfH)
      ctx.restore()

      if (heroTransform) {
        content.style.transform = heroTransform.toString()
      }
    }

    const loop = (now: number) => {
      if (disposed) return
      const dt = (now - lastFrame) / 1000
      lastFrame = now
      phase += dt * (speedRef.current / 100) * 0.6
      canvas.requestPaint?.()
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame((t) => {
      lastFrame = t
      loop(t)
    })

    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      canvas.width = Math.round(width)
      canvas.height = Math.round(height)
      canvas.requestPaint?.()
    })
    resizeObserver.observe(canvas)

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      window.removeEventListener('pointermove', onPointerMove)
      resizeObserver.disconnect()
      canvas.onpaint = null
    }
  }, [])

  return (
    <div
      ref={stageRef}
      className="not-prose relative my-8 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800"
      style={{
        minHeight: 'min(70vh, 640px)',
        background:
          'radial-gradient(ellipse at top left, rgba(108, 65, 240, 0.18), transparent 55%), radial-gradient(ellipse at bottom right, rgba(0, 229, 185, 0.15), transparent 55%), #07070d',
      }}
    >
      {status === 'checking' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-gray-300">
          正在检测 HTML-in-Canvas 支持…
        </div>
      )}

      {status === 'unavailable' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="max-w-lg rounded-xl border border-white/10 bg-black/70 px-5 py-4 text-sm leading-6 text-gray-200 shadow-xl backdrop-blur-md">
            <p className="mb-2 text-base font-semibold text-white">HTML-in-Canvas 不可用</p>
            <p className="mb-3 text-gray-300">
              当前浏览器未开启相关实验能力，无法运行下方
              Demo。请按文章「先决条件」完成设置后刷新本页：
            </p>
            <ol className="mb-3 list-decimal space-y-1 pl-5 text-gray-300">
              <li>使用 Chrome Canary，或 Chromium 147+ 的 Brave Stable</li>
              <li>
                打开{' '}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-[#00e5b9]">
                  chrome://flags/#canvas-draw-element
                </code>{' '}
                （Brave 用{' '}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">brave://</code>）
              </li>
              <li>将 flag 设为 Enabled，重启浏览器后再访问</li>
            </ol>
            <a
              href="https://html-in-canvas.dev/docs/browser-support/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#9a7cff] underline-offset-2 hover:underline"
            >
              查看官方浏览器支持说明 →
            </a>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full">
        <div
          ref={contentRef}
          className="absolute top-0 left-0 whitespace-nowrap"
          style={{
            padding: '1rem 2.25rem',
            fontSize: 'clamp(1.75rem, 4.5vw, 3.25rem)',
            fontWeight: 800,
            letterSpacing: '-0.025em',
            lineHeight: 1.05,
            background:
              'linear-gradient(135deg, #6c41f0 0%, #d52e66 45%, #ff5926 70%, #00e5b9 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            transition: 'none',
            transformOrigin: '0 0',
          }}
        >
          {text || ' '}
        </div>
      </canvas>

      {status === 'available' && (
        <>
          <div className="absolute top-4 left-4 z-20 rounded-md border border-white/10 bg-[rgba(15,15,22,0.72)] px-2.5 py-1.5 text-[0.7rem] font-semibold tracking-wider text-[#a0a0b8] uppercase backdrop-blur-md">
            <span className="tabular-nums">{copies}</span> paintings ·{' '}
            <strong className="font-bold text-[#00e5b9]">1</strong> DOM element
          </div>

          <div className="absolute bottom-4 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-full border border-white/10 bg-[rgba(15,15,22,0.72)] px-3 py-2 shadow-lg backdrop-blur-md">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="画进 canvas 的文字"
              className="w-[min(18rem,55vw)] rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-[#f0f0f0] outline-none focus:border-[rgba(108,65,240,0.6)] focus:shadow-[0_0_0_3px_rgba(108,65,240,0.2)]"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="hidden h-6 w-px bg-white/10 sm:block" />
            <label className="flex items-center gap-2 text-xs whitespace-nowrap text-[#8a8aa0]">
              Copies
              <input
                type="range"
                min={1}
                max={32}
                value={copies}
                onChange={(e) => setCopies(Number(e.target.value))}
                className="w-20 accent-[#9a7cff]"
              />
            </label>
            <label className="flex items-center gap-2 text-xs whitespace-nowrap text-[#8a8aa0]">
              Speed
              <input
                type="range"
                min={0}
                max={200}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-20 accent-[#9a7cff]"
              />
            </label>
          </div>
        </>
      )}
    </div>
  )
}
