'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Camera = { x: number; y: number; zoom: number }

type Note = {
  id: string
  x: number
  y: number
  text: string
  color: string
}

type PointerSample = { x: number; y: number }

type Gesture =
  | { kind: 'pan'; pointerId: number; lastX: number; lastY: number }
  | { kind: 'note'; pointerId: number; id: string; offsetX: number; offsetY: number }
  | { kind: 'pinch'; startDist: number; startZoom: number; worldX: number; worldY: number }

const MIN_ZOOM = 0.2
const MAX_ZOOM = 3
const NOTE_WIDTH = 168
const GRID_TARGET_PX = 56

const NOTE_COLORS = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fbcfe8', '#ddd6fe', '#fed7aa']

const INITIAL_CAMERA: Camera = { x: 0, y: 0, zoom: 1 }

const INITIAL_NOTES: Note[] = [
  {
    id: 'n1',
    x: -180,
    y: -148,
    color: '#fde68a',
    text: '拖空白处平移。看左上角，相机坐标在变。',
  },
  {
    id: 'n2',
    x: 12,
    y: -148,
    color: '#bfdbfe',
    text: '滚轮缩放会钉住光标下面的那个点。',
  },
  {
    id: 'n3',
    x: -180,
    y: 28,
    color: '#bbf7d0',
    text: '双击空白处，再放一张便签。',
  },
  {
    id: 'n4',
    x: 12,
    y: 28,
    color: '#fbcfe8',
    text: '拖标题栏移动我，我记在世界坐标里。',
  },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function mod(n: number, m: number) {
  if (!m) return 0
  return ((n % m) + m) % m
}

/** 1-2-5 步长，让屏幕上的网格间距始终落在大约 30–80px。 */
function gridStep(zoom: number) {
  const raw = GRID_TARGET_PX / zoom
  const base = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / base
  const nice = fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10
  return nice * base
}

function panBy(camera: Camera, dx: number, dy: number): Camera {
  return {
    ...camera,
    x: camera.x - dx / camera.zoom,
    y: camera.y - dy / camera.zoom,
  }
}

function clientToWorld(clientX: number, clientY: number, rect: DOMRect, camera: Camera) {
  const screenX = clientX - rect.left
  const screenY = clientY - rect.top
  return {
    x: (screenX - rect.width / 2) / camera.zoom + camera.x,
    y: (screenY - rect.height / 2) / camera.zoom + camera.y,
  }
}

function zoomAt(
  camera: Camera,
  screenX: number,
  screenY: number,
  width: number,
  height: number,
  nextZoom: number
): Camera {
  const worldX = (screenX - width / 2) / camera.zoom + camera.x
  const worldY = (screenY - height / 2) / camera.zoom + camera.y
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
  return {
    zoom,
    x: worldX - (screenX - width / 2) / zoom,
    y: worldY - (screenY - height / 2) / zoom,
  }
}

function formatNum(value: number) {
  return Math.round(value).toString()
}

function gridStyle(camera: Camera, width: number, height: number, tone: 'light' | 'dark') {
  const step = gridStep(camera.zoom)
  const minor = step * camera.zoom
  const major = minor * 5
  const originX = width / 2 - camera.x * camera.zoom
  const originY = height / 2 - camera.y * camera.zoom
  const ox = mod(originX, minor)
  const oy = mod(originY, minor)
  const oxM = mod(originX, major)
  const oyM = mod(originY, major)
  const minorColor = tone === 'light' ? 'rgba(70, 55, 40, 0.09)' : 'rgba(255, 255, 255, 0.06)'
  const majorColor = tone === 'light' ? 'rgba(70, 55, 40, 0.18)' : 'rgba(255, 255, 255, 0.14)'

  return {
    backgroundImage: `
      linear-gradient(to right, ${majorColor} 1px, transparent 1px),
      linear-gradient(to bottom, ${majorColor} 1px, transparent 1px),
      linear-gradient(to right, ${minorColor} 1px, transparent 1px),
      linear-gradient(to bottom, ${minorColor} 1px, transparent 1px)
    `,
    backgroundSize: `${major}px ${major}px, ${major}px ${major}px, ${minor}px ${minor}px, ${minor}px ${minor}px`,
    backgroundPosition: `${oxM}px ${oyM}px, ${oxM}px ${oyM}px, ${ox}px ${oy}px, ${ox}px ${oy}px`,
  }
}

export default function InfiniteCanvasDemo() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<Camera>(INITIAL_CAMERA)
  const notesRef = useRef<Note[]>(INITIAL_NOTES)
  const pointers = useRef(new Map<number, PointerSample>())
  const gesture = useRef<Gesture | null>(null)
  const seq = useRef(INITIAL_NOTES.length)

  const [camera, setCameraState] = useState<Camera>(INITIAL_CAMERA)
  const [notes, setNotesState] = useState<Note[]>(INITIAL_NOTES)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [gestureKind, setGestureKind] = useState<Gesture['kind'] | null>(null)
  const [raisedId, setRaisedId] = useState<string | null>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })

  const setCamera = useCallback((next: Camera) => {
    cameraRef.current = next
    setCameraState(next)
  }, [])

  const setNotes = useCallback((updater: (list: Note[]) => Note[]) => {
    setNotesState((list) => {
      const next = updater(list)
      notesRef.current = next
      return next
    })
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const measure = () => {
      const rect = viewport.getBoundingClientRect()
      setViewportSize((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height }
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = viewport.getBoundingClientRect()
      let delta = event.deltaY
      if (event.deltaMode === 1) delta *= 16
      else if (event.deltaMode === 2) delta *= rect.height
      const current = cameraRef.current
      const nextZoom = clamp(current.zoom * Math.exp(-delta * 0.0016), MIN_ZOOM, MAX_ZOOM)
      setCamera(
        zoomAt(
          current,
          event.clientX - rect.left,
          event.clientY - rect.top,
          rect.width,
          rect.height,
          nextZoom
        )
      )
    }

    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      observer.disconnect()
      viewport.removeEventListener('wheel', onWheel)
    }
  }, [setCamera])

  const frameOrigin = useCallback(() => {
    setCamera(INITIAL_CAMERA)
    setRaisedId(null)
  }, [setCamera])

  const zoomBy = useCallback(
    (factor: number) => {
      const viewport = viewportRef.current
      if (!viewport) return
      const rect = viewport.getBoundingClientRect()
      const current = cameraRef.current
      setCamera(
        zoomAt(
          current,
          rect.width / 2,
          rect.height / 2,
          rect.width,
          rect.height,
          current.zoom * factor
        )
      )
    },
    [setCamera]
  )

  const addNote = useCallback(
    (worldX: number, worldY: number) => {
      const id = `n${++seq.current}`
      const color = NOTE_COLORS[seq.current % NOTE_COLORS.length]
      setNotes((list) => [...list, { id, x: worldX, y: worldY, color, text: '写点什么' }])
      setRaisedId(id)
    },
    [setNotes]
  )

  const addNoteAtCenter = useCallback(() => {
    const stagger = (notesRef.current.length % 5) * 14
    addNote(cameraRef.current.x - NOTE_WIDTH / 2 + stagger, cameraRef.current.y - 36 + stagger)
  }, [addNote])

  const startPinch = useCallback(() => {
    const viewport = viewportRef.current
    const pts = [...pointers.current.values()]
    if (!viewport || pts.length < 2) return
    const rect = viewport.getBoundingClientRect()
    const midX = (pts[0].x + pts[1].x) / 2
    const midY = (pts[0].y + pts[1].y) / 2
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
    const world = clientToWorld(midX, midY, rect, cameraRef.current)
    gesture.current = {
      kind: 'pinch',
      startDist: dist,
      startZoom: cameraRef.current.zoom,
      worldX: world.x,
      worldY: world.y,
    }
    setGestureKind('pinch')
  }, [])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return
    const target = event.target as HTMLElement
    if (target.closest('[data-canvas-ui]') || target.closest('textarea')) return

    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture(event.pointerId)
    if (event.button === 1) event.preventDefault()

    if (pointers.current.size >= 2) {
      startPinch()
      return
    }

    const handle = target.closest('[data-note-handle]')
    const noteEl = target.closest('[data-note]')
    if (handle && noteEl) {
      const id = noteEl.getAttribute('data-note-id')
      const note = notesRef.current.find((item) => item.id === id)
      const rect = event.currentTarget.getBoundingClientRect()
      if (!id || !note) return
      const world = clientToWorld(event.clientX, event.clientY, rect, cameraRef.current)
      gesture.current = {
        kind: 'note',
        pointerId: event.pointerId,
        id,
        offsetX: world.x - note.x,
        offsetY: world.y - note.y,
      }
      setGestureKind('note')
      setRaisedId(id)
      return
    }

    gesture.current = {
      kind: 'pan',
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
    }
    setGestureKind('pan')
    event.currentTarget.focus({ preventScroll: true })
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setCursor(clientToWorld(event.clientX, event.clientY, rect, cameraRef.current))

    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    const currentGesture = gesture.current
    if (currentGesture?.kind === 'pinch') {
      const pts = [...pointers.current.values()]
      if (pts.length < 2) return
      const midX = (pts[0].x + pts[1].x) / 2
      const midY = (pts[0].y + pts[1].y) / 2
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
      const zoom = clamp(
        currentGesture.startZoom * (dist / currentGesture.startDist),
        MIN_ZOOM,
        MAX_ZOOM
      )
      const screenX = midX - rect.left
      const screenY = midY - rect.top
      setCamera({
        zoom,
        x: currentGesture.worldX - (screenX - rect.width / 2) / zoom,
        y: currentGesture.worldY - (screenY - rect.height / 2) / zoom,
      })
      return
    }

    if (currentGesture?.kind === 'pan' && currentGesture.pointerId === event.pointerId) {
      const dx = event.clientX - currentGesture.lastX
      const dy = event.clientY - currentGesture.lastY
      currentGesture.lastX = event.clientX
      currentGesture.lastY = event.clientY
      setCamera(panBy(cameraRef.current, dx, dy))
      return
    }

    if (currentGesture?.kind === 'note' && currentGesture.pointerId === event.pointerId) {
      const world = clientToWorld(event.clientX, event.clientY, rect, cameraRef.current)
      const { id, offsetX, offsetY } = currentGesture
      setNotes((list) =>
        list.map((note) =>
          note.id === id ? { ...note, x: world.x - offsetX, y: world.y - offsetY } : note
        )
      )
    }
  }

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const currentGesture = gesture.current
    if (currentGesture?.kind === 'pinch') {
      if (pointers.current.size >= 2) {
        startPinch()
      } else if (pointers.current.size === 1) {
        const entry = pointers.current.entries().next().value as [number, PointerSample] | undefined
        if (!entry) {
          gesture.current = null
          setGestureKind(null)
          return
        }
        const [pointerId, sample] = entry
        gesture.current = { kind: 'pan', pointerId, lastX: sample.x, lastY: sample.y }
        setGestureKind('pan')
      } else {
        gesture.current = null
        setGestureKind(null)
      }
      return
    }

    if (
      currentGesture &&
      'pointerId' in currentGesture &&
      currentGesture.pointerId === event.pointerId
    ) {
      gesture.current = null
      setGestureKind(null)
    }
  }

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-note]') || target.closest('[data-canvas-ui]')) return
    const rect = event.currentTarget.getBoundingClientRect()
    const world = clientToWorld(event.clientX, event.clientY, rect, cameraRef.current)
    addNote(world.x - NOTE_WIDTH / 2, world.y - 28)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const current = cameraRef.current
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const step = 48

    if (event.key === 'ArrowLeft') setCamera(panBy(current, step, 0))
    else if (event.key === 'ArrowRight') setCamera(panBy(current, -step, 0))
    else if (event.key === 'ArrowUp') setCamera(panBy(current, 0, step))
    else if (event.key === 'ArrowDown') setCamera(panBy(current, 0, -step))
    else if (event.key === '+' || event.key === '=') {
      setCamera(
        zoomAt(
          current,
          rect.width / 2,
          rect.height / 2,
          rect.width,
          rect.height,
          current.zoom * 1.15
        )
      )
    } else if (event.key === '-' || event.key === '_') {
      setCamera(
        zoomAt(
          current,
          rect.width / 2,
          rect.height / 2,
          rect.width,
          rect.height,
          current.zoom / 1.15
        )
      )
    } else if (event.key === '0') {
      frameOrigin()
    } else {
      return
    }
    event.preventDefault()
  }

  const originX = `calc(50% - ${camera.x * camera.zoom}px)`
  const originY = `calc(50% - ${camera.y * camera.zoom}px)`
  const hasSize = viewportSize.width > 0 && viewportSize.height > 0

  // application：方向键交给画布。jsx-a11y 把这个角色当成非交互元素。
  /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
  return (
    <div
      ref={viewportRef}
      role="application"
      tabIndex={0}
      aria-label="无限画布示例。拖拽空白处平移，滚轮缩放，双击空白处添加便签。聚焦后方向键平移，加号减号缩放，0 回到原点。"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onPointerLeave={() => {
        if (!gesture.current) setCursor(null)
      }}
      className={`not-prose focus-visible:ring-primary-500 relative my-8 h-[420px] overflow-hidden rounded-xl bg-[#f7f6f3] ring-1 ring-gray-200 outline-none select-none focus-visible:ring-2 sm:h-[520px] dark:bg-[#12141a] dark:ring-gray-800 ${
        gestureKind === 'pan' || gestureKind === 'note' ? 'cursor-grabbing' : 'cursor-grab'
      } touch-none`}
    >
      {hasSize && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 dark:hidden"
            style={gridStyle(camera, viewportSize.width, viewportSize.height, 'light')}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 hidden dark:block"
            style={gridStyle(camera, viewportSize.width, viewportSize.height, 'dark')}
          />
        </>
      )}

      <div
        aria-hidden
        className="bg-primary-500/45 pointer-events-none absolute right-0 left-0 h-px"
        style={{ top: originY }}
      />
      <div
        aria-hidden
        className="bg-primary-500/45 pointer-events-none absolute top-0 bottom-0 w-px"
        style={{ left: originX }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{ left: originX, top: originY }}
      >
        <span className="text-primary-700 dark:text-primary-300 absolute top-1.5 left-2 rounded bg-white/85 px-1 py-px text-[10px] font-medium whitespace-nowrap tabular-nums dark:bg-gray-900/85">
          0, 0
        </span>
      </div>

      <div
        className="pointer-events-none absolute top-1/2 left-1/2"
        style={{
          transform: `translate(${-camera.x * camera.zoom}px, ${-camera.y * camera.zoom}px) scale(${camera.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {notes.map((note) => (
          <article
            key={note.id}
            data-note
            data-note-id={note.id}
            className="pointer-events-auto absolute rounded-lg bg-white shadow-[0_8px_24px_rgba(30,20,10,0.12)] ring-1 ring-black/10"
            style={{
              left: note.x,
              top: note.y,
              width: NOTE_WIDTH,
              zIndex: note.id === raisedId ? 2 : 1,
            }}
          >
            <div
              className="flex items-center justify-between rounded-t-lg py-1 pr-1.5 pl-2.5"
              style={{ background: note.color }}
            >
              <div
                data-note-handle
                role="button"
                tabIndex={0}
                aria-label="拖动便签"
                onKeyDown={(event) => event.stopPropagation()}
                className="cursor-grab py-0.5 text-[11px] font-medium text-black/55 active:cursor-grabbing"
              >
                便签 · 拖这里
              </div>
              <button
                type="button"
                data-note-delete
                aria-label="删除便签"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setNotes((list) => list.filter((item) => item.id !== note.id))}
                className="flex h-5 w-5 items-center justify-center rounded text-sm leading-none text-black/45 hover:bg-black/10 hover:text-black"
              >
                ×
              </button>
            </div>
            <textarea
              value={note.text}
              rows={3}
              aria-label="便签内容"
              onChange={(event) => {
                const value = event.target.value
                setNotes((list) =>
                  list.map((item) => (item.id === note.id ? { ...item, text: value } : item))
                )
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="block w-full resize-none border-0 bg-transparent px-2.5 py-2 text-[13px] leading-5 text-gray-800 shadow-none ring-0 outline-none focus:ring-0"
            />
          </article>
        ))}
      </div>

      <div className="pointer-events-none absolute top-3 right-3 left-3 flex items-start justify-between gap-2">
        <div className="rounded-md bg-white/85 px-2 py-1 text-[11px] text-gray-600 tabular-nums shadow-sm ring-1 ring-black/5 backdrop-blur-sm dark:bg-gray-900/80 dark:text-gray-300 dark:ring-white/10">
          相机 {formatNum(camera.x)}, {formatNum(camera.y)} · {Math.round(camera.zoom * 100)}%
        </div>
        <div className="rounded-md bg-white/85 px-2 py-1 text-[11px] text-gray-600 tabular-nums shadow-sm ring-1 ring-black/5 backdrop-blur-sm dark:bg-gray-900/80 dark:text-gray-300 dark:ring-white/10">
          {cursor ? `光标 ${formatNum(cursor.x)}, ${formatNum(cursor.y)}` : '光标 —'}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
        <div
          data-canvas-ui
          className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5"
        >
          <p className="rounded-full bg-white/85 px-2.5 py-1 text-[11px] text-gray-500 shadow-sm ring-1 ring-black/5 dark:bg-gray-900/80 dark:text-gray-400 dark:ring-white/10">
            拖拽平移 · 滚轮缩放 · 双击添加
          </p>
          <button
            type="button"
            onClick={addNoteAtCenter}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-800 shadow-sm ring-1 ring-black/10 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-100 dark:ring-white/10 dark:hover:bg-gray-700"
          >
            添加便签
          </button>
          <button
            type="button"
            onClick={frameOrigin}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-800 shadow-sm ring-1 ring-black/10 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-100 dark:ring-white/10 dark:hover:bg-gray-700"
          >
            回到原点
          </button>
          <div className="ml-1 flex items-center overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-black/10 dark:bg-gray-800 dark:ring-white/10">
            <button
              type="button"
              aria-label="缩小"
              onClick={() => zoomBy(1 / 1.2)}
              className="px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              −
            </button>
            <span className="min-w-12 text-center text-[11px] text-gray-500 tabular-nums dark:text-gray-400">
              {Math.round(camera.zoom * 100)}%
            </span>
            <button
              type="button"
              aria-label="放大"
              onClick={() => zoomBy(1.2)}
              className="px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  )
  /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
}
