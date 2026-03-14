import { motion } from 'motion/react'

/**
 * Animated concentric rings + orbiting particles behind the logo.
 * Suggests data flowing through encryption layers.
 * Only animates transform + opacity (compositor-friendly).
 */

const RINGS = [
  { r: 130, duration: 40, direction: 1, dash: '6 10', opacity: 0.6, width: 1.5 },
  { r: 170, duration: 55, direction: -1, dash: '4 14', opacity: 0.45, width: 1.2 },
  { r: 210, duration: 70, direction: 1, dash: '8 20', opacity: 0.35, width: 1 },
]

const PARTICLES = [
  { r: 130, duration: 8, delay: 0, size: 4 },
  { r: 130, duration: 8, delay: 4, size: 3.5 },
  { r: 170, duration: 12, delay: 2, size: 3.5 },
  { r: 170, duration: 12, delay: 8, size: 3 },
  { r: 210, duration: 18, delay: 5, size: 3 },
]

const CX = 250
const CY = 250

export function CryptoOrbit() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <svg
        viewBox="0 0 500 500"
        className="size-full"
        aria-hidden="true"
      >
        {/* Rotating dashed rings */}
        {RINGS.map((ring, i) => (
          <motion.circle
            key={`ring-${i}`}
            cx={CX}
            cy={CY}
            r={ring.r}
            fill="none"
            stroke="currentColor"
            strokeWidth={ring.width}
            strokeDasharray={ring.dash}
            className="text-primary"
            style={{ opacity: ring.opacity, transformOrigin: `${CX}px ${CY}px` }}
            animate={{ rotate: 360 * ring.direction }}
            transition={{
              duration: ring.duration,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        ))}

        {/* Solid subtle rings (static reference) */}
        <circle cx={CX} cy={CY} r={95} fill="none" stroke="currentColor" strokeWidth={0.8} className="text-primary" opacity={0.2} />
        <circle cx={CX} cy={CY} r={240} fill="none" stroke="currentColor" strokeWidth={0.8} className="text-primary" opacity={0.12} />

        {/* Orbiting particles — small dots flowing along ring paths */}
        {PARTICLES.map((p, i) => (
          <motion.circle
            key={`particle-${i}`}
            cx={CX + p.r}
            cy={CY}
            r={p.size}
            fill="currentColor"
            className="text-primary"
            style={{ opacity: 0.6, transformOrigin: `${CX}px ${CY}px` }}
            animate={{ rotate: 360 }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        ))}

        {/* Tick marks at cardinal + ordinal points */}
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i * 15 * Math.PI) / 180
          const r1 = 238
          const r2 = i % 6 === 0 ? 248 : 243
          return (
            <line
              key={`tick-${i}`}
              x1={CX + r1 * Math.cos(angle)}
              y1={CY + r1 * Math.sin(angle)}
              x2={CX + r2 * Math.cos(angle)}
              y2={CY + r2 * Math.sin(angle)}
              stroke="currentColor"
              strokeWidth={0.5}
              className="text-primary"
              opacity={0.25}
            />
          )
        })}
      </svg>
    </div>
  )
}
