'use client'

import { useEffect, useRef, useState } from 'react'

const INITIAL_COLORS = [
  '#FFE8E8',
  '#FF2B2B',
  '#6D0000',
  '#C00000',
  '#FFC3C3',
  '#D92A3A',
  '#8A0000',
  '#FF7B86',
  '#FF0F0F',
]

const POSITIONS = [
  { x: 1, y: 1 },
  { x: 18, y: 1 },
  { x: 35, y: 1 },
  { x: 1, y: 18 },
  { x: 18, y: 18 },
  { x: 35, y: 18 },
  { x: 1, y: 35 },
  { x: 18, y: 35 },
  { x: 35, y: 35 },
]

function pickIndices(available: number[], count: number) {
  const pool = [...available]
  const picked: number[] = []
  while (picked.length < count && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length)
    picked.push(pool.splice(i, 1)[0])
  }
  return picked
}

function swapColors(colors: string[], indices: number[]) {
  const next = [...colors]
  const values = indices.map((i) => next[i])
  const rotated = [...values.slice(1), values[0]]
  indices.forEach((i, k) => {
    next[i] = rotated[k]
  })
  return next
}

export default function Logo({ size = 32 }: { size?: number }) {
  const [colors, setColors] = useState(INITIAL_COLORS)
  const [hovered, setHovered] = useState<number | null>(null)
  const hoveredRef = useRef(hovered)
  hoveredRef.current = hovered

  useEffect(() => {
    const id = setInterval(() => {
      setColors((prev) => {
        const available = prev.map((_, i) => i).filter((i) => i !== hoveredRef.current)
        if (available.length < 2) return prev

        const count = Math.min(available.length, Math.random() < 0.5 ? 2 : 4)
        return swapColors(prev, pickIndices(available, count))
      })
    }, 800)

    return () => clearInterval(id)
  }, [])

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 50 50"
      shapeRendering="crispEdges"
      aria-hidden
      className="overflow-visible"
    >
      {POSITIONS.map((pos, i) => {
        const isHovered = hovered === i
        return (
          <rect
            key={i}
            x={pos.x}
            y={pos.y}
            width={14}
            height={14}
            fill={colors[i]}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="cursor-pointer transition-[fill,filter] duration-300 ease-out"
            style={
              isHovered
                ? {
                    filter:
                      'brightness(1.45) saturate(1.15) drop-shadow(0 0 3px rgba(255, 80, 80, 0.85))',
                    stroke: '#ffffff',
                    strokeWidth: 1.5,
                  }
                : undefined
            }
          />
        )
      })}
    </svg>
  )
}
