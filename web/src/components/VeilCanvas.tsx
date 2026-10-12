// Hero WebGL2 scene: a breathing frosted veil over a payroll ledger. The cursor is a "private key" lens that
// thins the veil locally. One fullscreen fragment shader; no 3D library.
import { useEffect, useRef } from 'react'

const VERT = `#version 300 es
in vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;     // 0..1, origin bottom-left
uniform float uLens;     // 0..1 lens strength
uniform sampler2D uLedger;
uniform float uLedgerAspect;
out vec4 outColor;

uniform vec3 uPaper;     // page color the scene fades into
uniform vec3 uMist;      // veil tint
uniform float uMistAmt;  // how milky the veil is
uniform float uShade;    // fold shadow depth
const vec3 SEAL = vec3(0.96, 0.38, 0.24);

vec2 toP(vec2 uv) { return vec2((uv.x - 0.5) * uRes.x / uRes.y, uv.y - 0.5) * 2.6; }

// height field and its analytic gradient in one pass: returns (h, dh/dx, dh/dy)
vec3 veil(vec2 p, vec2 m) {
  float t = uTime;
  float s1 = 1.25 * p.y + 0.21 * t, u1 = 1.6 * p.x + 0.33 * t + 1.5 * sin(s1);
  float s2 = 0.85 * p.x - 0.17 * t, u2 = 2.2 * p.y - 0.26 * t + 1.3 * sin(s2);
  float u3 = (0.7 * p.x + p.y) * 3.3 + 0.47 * t;
  float c1 = 0.55 * cos(u1), c2 = 0.34 * cos(u2), c3 = 0.11 * cos(u3);
  vec3 r = vec3(
    0.55 * sin(u1) + 0.34 * sin(u2) + 0.11 * sin(u3),
    c1 * 1.6 + c2 * 1.105 * cos(s2) + c3 * 2.31,
    c1 * 1.875 * cos(s1) + c2 * 2.2 + c3 * 3.3);
  // cursor ripple
  vec2 dv = p - m;
  float d = max(length(dv), 1e-4);
  float w = 9.0 * d - uTime * 2.6, k = 0.11 * uLens * exp(-2.4 * d);
  r.x += sin(w) * k;
  r.yz += (k * (9.0 * cos(w) - 2.4 * sin(w))) * dv / d;
  return r;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = toP(uv);
  vec2 m = toP(uMouse);

  vec3 hv = veil(p, m);
  vec3 n = normalize(vec3(-hv.y, -hv.z, 3.2));

  // lens: the veil thins around the cursor
  float d = length(p - m);
  float lens = (1.0 - smoothstep(0.16, 0.62, d)) * uLens;
  float frost = mix(1.0, 0.06, lens);

  // ledger lies on a tilted plane receding toward the top
  vec2 q = uv - 0.5;
  float z = 1.0 + (q.y + 0.5) * 0.9;
  vec2 luv = vec2(q.x * uRes.x / uRes.y / z, (q.y + 0.5) / z);
  // amounts column (right edge of the texture) sits under the lens' resting spot
  float aspect = uRes.x / uRes.y;
  luv = vec2(luv.x * 0.95 / uLedgerAspect + 0.78 + 0.12 * (1.0 - min(aspect, 1.6) / 1.6), luv.y * 1.9 + uTime * 0.012);
  luv += n.xy * 0.03 * frost;

  // frosted blur: golden-angle spiral taps scaled by veil thickness
  vec3 col = vec3(0.0);
  float r = 0.0095 * frost;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float a = fi * 2.39996;
    col += texture(uLedger, luv + vec2(cos(a), sin(a)) * sqrt(fi / 8.0) * r).rgb;
  }
  col /= 8.0;
  col = mix(uPaper, col, mix(1.0, 1.7, lens)); // what the key reveals reads with more contrast than the veil

  // light the veil like silk
  vec3 L = normalize(vec3(-0.45, 0.6, 0.66));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float spec = pow(clamp(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 28.0);
  col *= 1.0 - uShade * frost * (1.0 - diff);
  col = mix(col, uMist, uMistAmt * (0.35 + 0.65 * diff) * frost);
  col += mix(uMist, SEAL, 0.35) * spec * 0.42 * frost;

  // faint seal-colored rim where the lens meets the veil
  float rim = (1.0 - smoothstep(0.0, 0.06, abs(d - 0.5))) * uLens * 0.12;
  col = mix(col, SEAL, rim);

  // vignette and fade into the page below
  col = mix(col, uPaper, smoothstep(0.25, 1.35, length((uv - vec2(0.5, 0.58)) * vec2(1.0, 1.25))));
  col = mix(uPaper, col, smoothstep(0.0, 0.32, uv.y));
  outColor = vec4(col, 1.0);
}`

type Palette = {
  paper: [number, number, number]; mist: [number, number, number]; mistAmt: number; shade: number
  bg: string; text: string; seal: string // ledger texture colors (CSS rgb parts)
}

const PALETTES: Record<'light' | 'dark', Palette> = {
  dark: { paper: [0.037, 0.053, 0.076], mist: [0.903, 0.929, 0.918], mistAmt: 0.085, shade: 0.32, bg: '10,13,19', text: '230,237,234', seal: '247,90,46' },
  light: { paper: [0.955, 0.972, 0.965], mist: [1, 1, 1], mistAmt: 0.42, shade: 0.14, bg: '244,248,246', text: '19,27,38', seal: '222,63,32' },
}

/** Fake but plausible payroll rows; deterministic so the hero looks the same on every load. */
function drawLedger(p: Palette): HTMLCanvasElement {
  const W = 2048, H = 1024
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = `rgb(${p.bg})`
  g.fillRect(0, 0, W, H)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const first = ['A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.', 'H.', 'J.', 'K.', 'L.', 'M.', 'N.', 'O.', 'P.', 'R.', 'S.', 'T.', 'V.', 'Y.']
  const last = ['CHEN', 'OKAFOR', 'LINDQVIST', 'MORALES', 'TANAKA', 'HASSAN', 'NOVAK', 'IBRAHIM', 'SILVA', 'PETROV', 'WU', 'MÜLLER', 'ADEYEMI', 'ROSSI', 'KIM', 'DUBOIS']
  const dept = ['ENG', 'OPS', 'DESIGN', 'RESEARCH', 'FINANCE', 'LEGAL', 'GROWTH', 'SUPPORT']
  const rowH = 52
  g.textBaseline = 'middle'
  for (let y = rowH / 2, i = 0; y < H; y += rowH, i++) {
    const name = `${first[Math.floor(rnd() * first.length)]} ${last[Math.floor(rnd() * last.length)]}`
    const amount = (2800 + Math.floor(rnd() * 9200) + rnd()).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const hash = `0x${Math.floor(rnd() * 0xffffffff).toString(16).padStart(8, '0')}…${Math.floor(rnd() * 0xffff).toString(16).padStart(4, '0')}`
    g.font = '400 24px "IBM Plex Mono"'
    g.fillStyle = `rgba(${p.text},0.28)`
    g.fillText(String(i + 1).padStart(3, '0'), 60, y)
    g.fillStyle = `rgba(${p.text},0.62)`
    g.fillText(name, 170, y)
    g.fillStyle = `rgba(${p.text},0.3)`
    g.fillText(dept[Math.floor(rnd() * dept.length)], 760, y)
    g.fillText(hash, 1020, y)
    g.font = '500 28px "IBM Plex Mono"'
    g.fillStyle = i % 7 === 3 ? `rgba(${p.seal},0.9)` : `rgba(${p.text},0.92)`
    g.textAlign = 'right'
    g.fillText(`${amount} USDC`, W - 60, y)
    g.textAlign = 'left'
    g.fillStyle = `rgba(${p.text},0.06)`
    g.fillRect(60, y + rowH / 2 - 1, W - 120, 1)
  }
  return c
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(s)}`)
  return s
}

export function VeilCanvas({ className, theme }: { className?: string; theme: 'light' | 'dark' }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    try {
      return start(canvas, PALETTES[theme])
    } catch (err) {
      console.error('veil: WebGL disabled, using CSS background', err) // UI boundary: decoration only
      return undefined
    }
  }, [theme])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={className}
      style={{ background: 'radial-gradient(120% 80% at 60% 40%, color-mix(in oklch, var(--bone) 9%, var(--ink)), var(--ink) 70%)' }}
    />
  )
}

/** Sets up the scene; returns cleanup. Throws if WebGL2 or the shaders are unavailable. */
function start(canvas: HTMLCanvasElement, palette: Palette): () => void {
  {
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false })
    if (!gl) throw new Error('WebGL2 unavailable')
    let disposed = false
    let raf = 0
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`program: ${gl.getProgramInfoLog(prog)}`)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const u = (name: string) => gl.getUniformLocation(prog, name)
    const uRes = u('uRes'), uTime = u('uTime'), uMouse = u('uMouse'), uLens = u('uLens')
    gl.uniform1i(u('uLedger'), 0)
    gl.uniform1f(u('uLedgerAspect'), 2)
    gl.uniform3fv(u('uPaper'), palette.paper)
    gl.uniform3fv(u('uMist'), palette.mist)
    gl.uniform1f(u('uMistAmt'), palette.mistAmt)
    gl.uniform1f(u('uShade'), palette.shade)

    const tex = gl.createTexture()
    const upload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true) // canvas rows run top-down, GL v runs bottom-up
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, drawLedger(palette))
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    }
    upload()
    // redraw once the mono font is in, otherwise the first texture uses a fallback face
    document.fonts.load('500 28px "IBM Plex Mono"').then(() => !disposed && upload())

    // ponytail: the veil is a blur, so render below CSS resolution and let the browser upscale.
    let scale = 0.75
    const resize = () => {
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale))
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale))
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(uRes, canvas.width, canvas.height)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // pointer drives the lens; when idle it drifts on its own so touch and first-time visitors see it
    const target = { x: 0.62, y: 0.55, active: false, last: 0 }
    const cur = { x: 0.62, y: 0.55, lens: 0.75 }
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      if (e.clientY > r.bottom) return
      target.x = (e.clientX - r.left) / r.width
      target.y = 1 - (e.clientY - r.top) / r.height
      target.active = true
      target.last = performance.now()
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    let visible = true
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible && !reduced) loop()
    })
    io.observe(canvas)

    const t0 = performance.now()
    const frame = (now: number) => {
      const t = (now - t0) / 1000
      if (target.active && now - target.last > 2600) target.active = false
      const tx = target.active ? target.x : 0.5 + Math.cos(t * 0.23) * 0.24
      // portrait screens: keep the idle lens above the headline
      const idleY = canvas.clientWidth < canvas.clientHeight ? 0.8 : 0.52
      const ty = target.active ? target.y : idleY + Math.sin(t * 0.31) * 0.1
      cur.x += (tx - cur.x) * 0.06
      cur.y += (ty - cur.y) * 0.06
      cur.lens += ((target.active ? 1 : 0.7) - cur.lens) * 0.04
      gl.uniform1f(uTime, reduced ? 12 : t)
      gl.uniform2f(uMouse, cur.x, cur.y)
      gl.uniform1f(uLens, cur.lens)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    // slow device: shrink the render target, then fall back to a still frame
    let frozen = false
    let samples: number[] = []
    let prev = 0
    const adapt = (now: number) => {
      if (prev) samples.push(now - prev)
      prev = now
      if (samples.length < 40) return
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length
      samples = []
      if (avg < 30) return
      if (scale > 0.26) {
        scale *= 0.7
        resize()
      } else {
        frozen = true
        console.warn('veil: device too slow, showing a still frame')
      }
    }
    const loop = () => {
      cancelAnimationFrame(raf)
      prev = 0
      const tick = (now: number) => {
        if (disposed || !visible || document.hidden || frozen) return
        frame(now)
        adapt(now)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    const onVisibility = () => !document.hidden && !reduced && loop()
    document.addEventListener('visibilitychange', onVisibility)
    if (reduced) requestAnimationFrame(frame)
    else loop()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', onVisibility)
      // free resources only: losing the context would break a remount on the same canvas (StrictMode)
      gl.deleteTexture(tex)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    }
  }
}
