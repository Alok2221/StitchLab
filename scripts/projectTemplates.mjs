/**
 * Project each garment GLB into flat SVG templates that match the 3D shells.
 * Parts come from named meshes / the outer shell, then sleeves & legs are split
 * spatially from the projected silhouette.
 *
 * Usage: node scripts/projectTemplates.mjs
 */
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { Matrix4, Mesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const MESH_DIR = join(ROOT, 'src/renderer/src/preview3d/meshes')
const OUT_DIR = join(ROOT, 'src/renderer/src/templates')

const RES = 640
const VIEW_LONG = 600
const PAD = 0.03

const GARMENTS = {
  tshirt: {
    file: 'tshirt.glb',
    id: 'tshirt',
    name: 'T-shirt',
    category: 'tops',
    views: ['front', 'back'],
    yaw: 0,
    // Outer cloth + collar only (other FBX_* are duplicate shells).
    pick: [
      { mesh: /^FBX_1$/, id: 'shell', label: 'Body', color: '#e8e4dc' },
      { mesh: /^FBX_2$/, id: 'collar', label: 'Collar', color: '#d4cfc4' }
    ],
    splitShell: 'tops'
  },
  hoodie: {
    file: 'hoodie.glb',
    id: 'hoodie',
    name: 'Hoodie',
    category: 'tops',
    views: ['front', 'back'],
    yaw: Math.PI,
    pick: [{ mesh: /^HOODIE_1$/, id: 'shell', label: 'Body', color: '#3d5a80' }],
    splitShell: 'tops'
  },
  trousers: {
    file: 'trousers.glb',
    id: 'trousers',
    name: 'Trousers',
    category: 'bottoms',
    views: ['front', 'back'],
    yaw: 0,
    pick: [{ mesh: /^FBX_1$/, id: 'shell', label: 'Body', color: '#4a5568' }],
    splitShell: 'bottoms'
  },
  dress: {
    file: 'dress.glb',
    id: 'dress',
    name: 'Dress',
    category: 'dresses',
    views: ['front', 'back'],
    yaw: 0,
    pick: [
      { mesh: /1020260/, id: 'body', label: 'Body', color: '#c9a0a0' },
      { mesh: /807831/, id: 'strap-left', label: 'Strap left', color: '#b88888' },
      { mesh: /807832/, id: 'strap-right', label: 'Strap right', color: '#b88888' },
      { mesh: /806438/, id: 'yoke-front', label: 'Yoke front', color: '#b88888' },
      { mesh: /806439/, id: 'yoke-back', label: 'Yoke back', color: '#a87070' }
    ]
  },
  'tote-bag': {
    file: 'tote.glb',
    id: 'tote-bag',
    name: 'Tote bag',
    category: 'bags',
    views: ['front'],
    yaw: 0,
    pick: [
      { mesh: /^1004$/, id: 'body', label: 'Body', color: '#efe6d2' },
      { mesh: /^2002$/, id: 'handles', label: 'Handles', color: '#c2a878' },
      { mesh: /^3002$/, id: 'base', label: 'Base', color: '#c2a878' },
      { mesh: /^1003$/, id: 'top-band', label: 'Top band', color: '#a89060' }
    ]
  },
  sneaker: {
    file: 'sneaker.glb',
    id: 'sneaker',
    name: 'Sneaker',
    category: 'footwear',
    views: ['outer'],
    yaw: Math.PI / 2,
    pick: [{ mesh: /^ShoeL$/, id: 'upper', label: 'Upper', color: '#f4f4f2' }],
    addPrint: true
  },
  'chelsea-boot': {
    file: 'boot.glb',
    id: 'chelsea-boot',
    name: 'Chelsea boot',
    category: 'footwear',
    views: ['outer'],
    yaw: Math.PI / 2,
    pick: [
      { mesh: /^Base$/, id: 'upper', label: 'Upper', color: '#3b3f4a' },
      { mesh: /^Sole$/, id: 'sole', label: 'Sole', color: '#1a1a1a' },
      { mesh: /^Tongue$/, id: 'tongue', label: 'Tongue', color: '#4a4e58' },
      { mesh: /^(holders|Shoelaces)$/, id: 'hardware', label: 'Hardware', color: '#8a8e98' }
    ]
  },
  'slide-sandal': {
    file: 'sandal.glb',
    id: 'slide-sandal',
    name: 'Slide sandal',
    category: 'footwear',
    views: ['outer'],
    yaw: Math.PI / 2,
    pick: [{ mesh: /^Flip_flop002$/, id: 'strap', label: 'Strap', color: '#2c3e50' }],
    addPrint: true
  }
}

async function loadGlb(path) {
  const buf = readFileSync(path)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return new Promise((resolve, reject) => new GLTFLoader().parse(ab, '', resolve, reject))
}

function applyYaw(geometry, yaw) {
  if (!yaw) return
  geometry.applyMatrix4(new Matrix4().makeRotationY(yaw))
}

function ensureFrontPlusZ(positions, indices) {
  let netZ = 0
  let area = 0
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t] * 3
    const i1 = indices[t + 1] * 3
    const i2 = indices[t + 2] * 3
    const ax = positions[i0]
    const ay = positions[i0 + 1]
    const az = positions[i0 + 2]
    const e1x = positions[i1] - ax
    const e1y = positions[i1 + 1] - ay
    const e1z = positions[i1 + 2] - az
    const e2x = positions[i2] - ax
    const e2y = positions[i2 + 1] - ay
    const e2z = positions[i2 + 2] - az
    const cx = e1y * e2z - e1z * e2y
    const cy = e1z * e2x - e1x * e2z
    const cz = e1x * e2y - e1y * e2x
    const a = Math.hypot(cx, cy, cz)
    if (a < 1e-12) continue
    netZ += cz
    area += a
  }
  if (area > 0 && netZ / area < -0.05) {
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] *= -1
      positions[i + 2] *= -1
    }
  }
}

function collect(scene, spec) {
  scene.updateMatrixWorld(true)
  const items = []
  scene.traverse((obj) => {
    if (!(obj instanceof Mesh) || !obj.geometry) return
    const hit = spec.pick.find((p) => p.mesh.test(obj.name || ''))
    if (!hit) return
    const geometry = obj.geometry.clone()
    geometry.applyMatrix4(obj.matrixWorld)
    applyYaw(geometry, spec.yaw)
    geometry.deleteAttribute('normal')
    geometry.deleteAttribute('uv')
    items.push({ hit, geometry })
  })

  const allPos = []
  const allIdx = []
  let base = 0
  for (const { geometry } of items) {
    const pos = geometry.getAttribute('position')
    if (!pos) continue
    for (let i = 0; i < pos.count; i++) allPos.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    const index = geometry.getIndex()
    if (index) for (let i = 0; i < index.count; i++) allIdx.push(index.getX(i) + base)
    else for (let i = 0; i < pos.count; i++) allIdx.push(base + i)
    base += pos.count
  }
  const arr = new Float32Array(allPos)
  ensureFrontPlusZ(arr, allIdx)
  let cursor = 0
  for (const { geometry } of items) {
    const pos = geometry.getAttribute('position')
    if (!pos) continue
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, arr[cursor], arr[cursor + 1], arr[cursor + 2])
      cursor += 3
    }
  }
  return items
}

function mergeItems(items) {
  const byId = new Map()
  for (const { hit, geometry } of items) {
    const list = byId.get(hit.id) ?? { hit, geometries: [] }
    list.geometries.push(geometry)
    byId.set(hit.id, list)
  }
  const parts = []
  for (const [, { hit, geometries }] of byId) {
    const positions = []
    const indices = []
    let base = 0
    for (const g of geometries) {
      const pos = g.getAttribute('position')
      if (!pos) continue
      for (let i = 0; i < pos.count; i++) positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
      const index = g.getIndex()
      if (index) for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + base)
      else for (let i = 0; i < pos.count; i++) indices.push(base + i)
      base += pos.count
    }
    parts.push({ id: hit.id, label: hit.label, color: hit.color, positions: new Float32Array(positions), indices })
  }
  return parts
}

function boundsOf(positions) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i])
    maxX = Math.max(maxX, positions[i])
    minY = Math.min(minY, positions[i + 1])
    maxY = Math.max(maxY, positions[i + 1])
    minZ = Math.min(minZ, positions[i + 2])
    maxZ = Math.max(maxZ, positions[i + 2])
  }
  return { minX, maxX, minY, maxY, minZ, maxZ }
}

function stampTri(mask, size, x0, y0, x1, y1, x2, y2) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)))
  const maxX = Math.min(size - 1, Math.ceil(Math.max(x0, x1, x2)))
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)))
  const maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2)))
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
  if (Math.abs(area) < 1e-8) return
  const sign = area > 0 ? 1 : -1
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * sign
      const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * sign
      const w2 = ((x0 - px) * (y1 - py) - (x1 - px) * (y0 - py)) * sign
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) mask[y * size + x] = 1
    }
  }
}

function rasterize(positions, indices, frame, view, size) {
  const mask = new Uint8Array(size * size)
  const { minX, maxX, minY, maxY } = frame
  const spanX = Math.max(1e-6, maxX - minX)
  const spanY = Math.max(1e-6, maxY - minY)
  const mirrorX = view === 'back'
  const toPx = (i) => {
    let x = positions[i]
    const y = positions[i + 1]
    if (mirrorX) x = maxX - (x - minX)
    const u = (x - minX) / spanX
    const v = (y - minY) / spanY
    return [(PAD + u * (1 - 2 * PAD)) * size, (1 - (PAD + v * (1 - 2 * PAD))) * size]
  }
  for (let t = 0; t < indices.length; t += 3) {
    const [x0, y0] = toPx(indices[t] * 3)
    const [x1, y1] = toPx(indices[t + 1] * 3)
    const [x2, y2] = toPx(indices[t + 2] * 3)
    stampTri(mask, size, x0, y0, x1, y1, x2, y2)
  }
  return mask
}

const N8 = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
]

function at(mask, size, x, y) {
  if (x < 0 || y < 0 || x >= size || y >= size) return 0
  return mask[y * size + x]
}

function traceContour(mask, size) {
  let sx = -1
  let sy = -1
  outer: for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (mask[y * size + x] && !at(mask, size, x, y - 1)) {
        sx = x
        sy = y
        break outer
      }
    }
  }
  if (sx < 0) return null
  const ring = []
  let x = sx
  let y = sy
  let dir = 0
  for (let step = 0; step < size * size; step++) {
    ring.push([x, y])
    let found = false
    for (let k = 0; k < 8; k++) {
      const nd = (dir + 6 + k) % 8
      const nx = x + N8[nd][0]
      const ny = y + N8[nd][1]
      if (at(mask, size, nx, ny)) {
        x = nx
        y = ny
        dir = nd
        found = true
        break
      }
    }
    if (!found) break
    if (x === sx && y === sy && ring.length > 8) break
  }
  return ring.length > 8 ? ring : null
}

function rdp(points, epsilon) {
  if (points.length < 3) return points
  const [x1, y1] = points[0]
  const [x2, y2] = points[points.length - 1]
  let maxD = 0
  let idx = 0
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.abs(dy * points[i][0] - dx * points[i][1] + x2 * y1 - y2 * x1) / len
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD > epsilon) {
    const left = rdp(points.slice(0, idx + 1), epsilon)
    const right = rdp(points.slice(idx), epsilon)
    return left.slice(0, -1).concat(right)
  }
  return [points[0], points[points.length - 1]]
}

function pathFromRing(ring, size, viewW, viewH) {
  const simplified = rdp(ring, 1.4)
  const sx = viewW / size
  const sy = viewH / size
  const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '')
  let d = ''
  for (let i = 0; i < simplified.length; i++) {
    d += `${i === 0 ? 'M' : 'L'}${fmt(simplified[i][0] * sx)} ${fmt(simplified[i][1] * sy)} `
  }
  return d + 'Z'
}

function dilate(mask, size, rounds = 1) {
  let cur = mask
  for (let r = 0; r < rounds; r++) {
    const next = cur.slice()
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (cur[y * size + x]) continue
        if (cur[y * size + x - 1] || cur[y * size + x + 1] || cur[(y - 1) * size + x] || cur[(y + 1) * size + x]) {
          next[y * size + x] = 1
        }
      }
    }
    cur = next
  }
  return cur
}

function maskArea(mask) {
  let n = 0
  for (const v of mask) if (v) n++
  return n
}

/** Split a top shell into body + sleeve-left + sleeve-right by column spans. */
function splitTops(shellMask, size) {
  const body = shellMask.slice()
  const left = new Uint8Array(size * size)
  const right = new Uint8Array(size * size)
  // Find torso width as the median opaque span in the middle third of rows.
  const spans = []
  const y0 = Math.floor(size * 0.35)
  const y1 = Math.floor(size * 0.7)
  for (let y = y0; y < y1; y++) {
    let l = -1
    let r = -1
    for (let x = 0; x < size; x++) {
      if (!shellMask[y * size + x]) continue
      if (l < 0) l = x
      r = x
    }
    if (l >= 0) spans.push(r - l)
  }
  spans.sort((a, b) => a - b)
  const torsoW = spans[Math.floor(spans.length / 2)] || size * 0.4
  const half = torsoW / 2
  const mid = size / 2
  const leftBound = mid - half * 0.95
  const rightBound = mid + half * 0.95

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!shellMask[y * size + x]) continue
      if (x < leftBound) {
        left[y * size + x] = 1
        body[y * size + x] = 0
      } else if (x > rightBound) {
        right[y * size + x] = 1
        body[y * size + x] = 0
      }
    }
  }
  return { body, left, right }
}

/** Split trousers shell into waist + leg-left + leg-right. */
function splitBottoms(shellMask, size) {
  const waist = new Uint8Array(size * size)
  const left = new Uint8Array(size * size)
  const right = new Uint8Array(size * size)
  // Waist = top 18% of opaque rows.
  let yTop = size
  let yBot = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!shellMask[y * size + x]) continue
      yTop = Math.min(yTop, y)
      yBot = Math.max(yBot, y)
    }
  }
  const waistY = yTop + (yBot - yTop) * 0.18
  const mid = size / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!shellMask[y * size + x]) continue
      if (y <= waistY) waist[y * size + x] = 1
      else if (x < mid) left[y * size + x] = 1
      else right[y * size + x] = 1
    }
  }
  return { waist, left, right }
}

function zoneFromMask(mask, size, viewW, viewH, id, label, color) {
  if (maskArea(mask) < 40) return null
  const dilated = dilate(mask, size, 1)
  const ring = traceContour(dilated, size)
  if (!ring) return null
  return { id, label, color, path: pathFromRing(ring, size, viewW, viewH) }
}

function buildSvg(spec, view, zones, viewW, viewH) {
  const viewLabel = view === 'front' ? 'Front' : view === 'back' ? 'Back' : 'Outer side'
  const paths = zones
    .map((z) => `  <path id="zone-${z.id}" data-label="${z.label}" fill="${z.color}"\n    d="${z.path}" />`)
    .join('\n')
  const print = `  <rect id="print-area" x="${Math.round(viewW * 0.28)}" y="${Math.round(viewH * 0.32)}" width="${Math.round(viewW * 0.44)}" height="${Math.round(viewH * 0.4)}" fill="none" />`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewW} ${viewH}" data-template-id="${spec.id}" data-view="${view}" data-view-label="${viewLabel}" data-name="${spec.name}" data-category="${spec.category}">
${paths}
${print}
</svg>
`
}

async function projectGarment(key, spec) {
  console.log('projecting', key)
  const gltf = await loadGlb(join(MESH_DIR, spec.file))
  const items = collect(gltf.scene, spec)
  if (items.length === 0) throw new Error(`No parts for ${key}`)
  const parts = mergeItems(items)

  let frame = null
  for (const p of parts) {
    const b = boundsOf(p.positions)
    frame = frame
      ? {
          minX: Math.min(frame.minX, b.minX),
          maxX: Math.max(frame.maxX, b.maxX),
          minY: Math.min(frame.minY, b.minY),
          maxY: Math.max(frame.maxY, b.maxY),
          minZ: Math.min(frame.minZ, b.minZ),
          maxZ: Math.max(frame.maxZ, b.maxZ)
        }
      : { ...b }
  }

  const aspect = (frame.maxX - frame.minX) / Math.max(1e-6, frame.maxY - frame.minY)
  const viewW = aspect >= 1 ? VIEW_LONG : Math.max(220, Math.round(VIEW_LONG * aspect))
  const viewH = aspect >= 1 ? Math.max(220, Math.round(VIEW_LONG / aspect)) : VIEW_LONG

  for (const view of spec.views) {
    const zones = []

    if (spec.splitShell) {
      const shell = parts.find((p) => p.id === 'shell')
      if (!shell) throw new Error(`Missing shell for ${key}`)
      const shellMask = rasterize(shell.positions, shell.indices, frame, view, RES)
      if (spec.splitShell === 'tops') {
        const { body, left, right } = splitTops(shellMask, RES)
        // On the back drawing the image is mirrored, so the left island is the wearer's right.
        const L = view === 'back' ? 'sleeve-right' : 'sleeve-left'
        const R = view === 'back' ? 'sleeve-left' : 'sleeve-right'
        const Ll = view === 'back' ? 'Sleeve right' : 'Sleeve left'
        const Rl = view === 'back' ? 'Sleeve left' : 'Sleeve right'
        for (const z of [
          zoneFromMask(body, RES, viewW, viewH, 'body', 'Body', shell.color),
          zoneFromMask(left, RES, viewW, viewH, L, Ll, shell.color),
          zoneFromMask(right, RES, viewW, viewH, R, Rl, shell.color)
        ]) {
          if (z) zones.push(z)
        }
      } else {
        const { waist, left, right } = splitBottoms(shellMask, RES)
        const L = view === 'back' ? 'leg-right' : 'leg-left'
        const R = view === 'back' ? 'leg-left' : 'leg-right'
        const Ll = view === 'back' ? 'Leg right' : 'Leg left'
        const Rl = view === 'back' ? 'Leg left' : 'Leg right'
        for (const z of [
          zoneFromMask(waist, RES, viewW, viewH, 'waist', 'Waistband', '#3d4554'),
          zoneFromMask(left, RES, viewW, viewH, L, Ll, shell.color),
          zoneFromMask(right, RES, viewW, viewH, R, Rl, shell.color)
        ]) {
          if (z) zones.push(z)
        }
      }
      for (const p of parts) {
        if (p.id === 'shell') continue
        const mask = rasterize(p.positions, p.indices, frame, view, RES)
        const z = zoneFromMask(mask, RES, viewW, viewH, p.id, p.label, p.color)
        if (z) zones.push(z)
      }
    } else {
      for (const p of parts) {
        const mask = rasterize(p.positions, p.indices, frame, view, RES)
        const z = zoneFromMask(mask, RES, viewW, viewH, p.id, p.label, p.color)
        if (z) zones.push(z)
      }
    }

    if (spec.addPrint && zones.length === 1) {
      zones.push({
        id: 'print',
        label: 'Print',
        color: '#dddddd',
        path: `M${Math.round(viewW * 0.3)} ${Math.round(viewH * 0.35)} L${Math.round(viewW * 0.7)} ${Math.round(viewH * 0.35)} L${Math.round(viewW * 0.7)} ${Math.round(viewH * 0.7)} L${Math.round(viewW * 0.3)} ${Math.round(viewH * 0.7)} Z`
      })
    }

    if (zones.length < 2) throw new Error(`Need ≥2 zones for ${key} ${view}, got ${zones.length}`)

    let outName = `${spec.id}-${view}.svg`
    if (spec.id === 'sneaker') outName = 'sneaker-side.svg'
    if (spec.id === 'chelsea-boot') outName = 'chelsea-boot-side.svg'
    if (spec.id === 'slide-sandal') outName = 'slide-sandal-side.svg'
    if (spec.id === 'tote-bag') outName = 'tote-bag.svg'

    const outPath = join(OUT_DIR, outName)
    const tmpPath = `${outPath}.${process.pid}.tmp`
    writeFileSync(tmpPath, buildSvg(spec, view, zones, viewW, viewH))
    try {
      renameSync(tmpPath, outPath)
    } catch {
      writeFileSync(outPath, readFileSync(tmpPath))
      try {
        unlinkSync(tmpPath)
      } catch {
        /* ignore */
      }
    }
    console.log('  wrote', outName, '→', zones.map((z) => z.id).join(', '))
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  for (const [key, spec] of Object.entries(GARMENTS)) await projectGarment(key, spec)
  console.log('done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
