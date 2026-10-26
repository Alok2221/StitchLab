import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  ShadowMaterial,
  Spherical,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { InflatedMesh } from './inflate'
import { LIGHTING_PRESETS, type Lighting, type LightingPreset } from './lighting'
import { pngFromDataUrl, snapshotSize } from './snapshot'

export type CameraPreset = 'front' | 'back' | 'side' | 'three-quarter'

export interface SnapshotOptions {
  longSide: number
  transparent: boolean
}

export interface Viewer {
  setMesh: (mesh: InflatedMesh) => void
  setTextures: (front: HTMLCanvasElement, back: HTMLCanvasElement) => void
  setPreset: (preset: CameraPreset) => void
  setLighting: (preset: LightingPreset) => void
  /** PNG of the current camera, rendered at `longSide` on the longer edge. */
  capturePng: (options: SnapshotOptions) => Uint8Array
  dispose: () => void
}

const FOV = 35
/** Size of the garment's long side in scene units. */
const MODEL_SIZE = 2
const FIT_MARGIN = 1.3
const TRANSITION_MS = 450

const PRESET_DIRECTIONS: Record<CameraPreset, Vector3> = {
  front: new Vector3(0, 0.08, 1),
  back: new Vector3(0, 0.08, -1),
  side: new Vector3(1, 0.08, 0),
  'three-quarter': new Vector3(0.8, 0.3, 0.9)
}

function garmentMaterial() {
  return new MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, side: DoubleSide })
}

function applyLight(light: DirectionalLight, spec: Lighting['key'] | Lighting['fill']) {
  light.color.setHex(spec.color)
  light.intensity = spec.intensity
  light.position.set(...spec.position)
}

/** Three.js scene with the garment, studio lighting and an orbit camera, drawn into `host`. */
export function createViewer(host: HTMLElement, { onOrbit }: { onOrbit?: () => void } = {}): Viewer {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(devicePixelRatio)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = NeutralToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  host.appendChild(renderer.domElement)

  const scene = new Scene()
  const camera = new PerspectiveCamera(FOV, 1, 0.01, 100)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.minDistance = 1
  controls.maxDistance = 10

  const hemi = new HemisphereLight()
  const key = new DirectionalLight()
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = key.shadow.camera.bottom = -2
  key.shadow.camera.right = key.shadow.camera.top = 2
  key.shadow.normalBias = 0.02
  key.shadow.radius = 6
  const fill = new DirectionalLight()
  const rim = new DirectionalLight()
  scene.add(hemi, key, fill, rim)

  const floor = new Mesh(new CircleGeometry(3, 64), new ShadowMaterial({ opacity: 0.28 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const applyLighting = (preset: LightingPreset) => {
    const lighting = LIGHTING_PRESETS[preset]
    scene.background = new Color(lighting.background)
    hemi.color.setHex(lighting.hemi.sky)
    hemi.groundColor.setHex(lighting.hemi.ground)
    hemi.intensity = lighting.hemi.intensity
    applyLight(key, lighting.key)
    key.castShadow = lighting.key.shadow
    applyLight(fill, lighting.fill)
    applyLight(rim, lighting.rim)
    floor.material.opacity = lighting.floorOpacity
  }
  applyLighting('studio')

  const materials = [garmentMaterial(), garmentMaterial()]
  const garment = new Mesh(new BufferGeometry(), materials)
  garment.castShadow = true
  garment.visible = false
  scene.add(garment)

  let preset: CameraPreset = 'front'
  let fitDistance = 5
  let transition: { from: Spherical; to: Spherical; start: number } | null = null

  const presetPosition = (p: CameraPreset) => PRESET_DIRECTIONS[p].clone().normalize().multiplyScalar(fitDistance)

  const fit = () => {
    garment.geometry.computeBoundingBox()
    const box = garment.geometry.boundingBox
    if (!box) return
    const size = box.getSize(new Vector3())
    const tan = Math.tan(MathUtils.degToRad(FOV / 2))
    fitDistance = Math.max(size.y / 2 / tan, size.x / 2 / (tan * camera.aspect)) * FIT_MARGIN + size.z / 2
  }

  const resize = () => {
    const { clientWidth, clientHeight } = host
    if (!clientWidth || !clientHeight) return
    renderer.setSize(clientWidth, clientHeight)
    camera.aspect = clientWidth / clientHeight
    camera.updateProjectionMatrix()
    fit()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()
  camera.position.copy(presetPosition(preset))

  controls.addEventListener('start', () => {
    transition = null
    onOrbit?.()
  })

  renderer.setAnimationLoop((time) => {
    if (transition) {
      const t = Math.min(1, (time - transition.start) / TRANSITION_MS)
      const eased = t * t * (3 - 2 * t)
      const { from, to } = transition
      const spherical = new Spherical(
        MathUtils.lerp(from.radius, to.radius, eased),
        MathUtils.lerp(from.phi, to.phi, eased),
        MathUtils.lerp(from.theta, to.theta, eased)
      )
      camera.position.setFromSpherical(spherical)
      camera.lookAt(controls.target)
      if (t === 1) {
        transition = null
        controls.enabled = true
      }
    } else {
      controls.update()
    }
    renderer.render(scene, camera)
  })

  return {
    setMesh(mesh) {
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3))
      geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2))
      geometry.setIndex(new BufferAttribute(mesh.indices, 1))
      geometry.addGroup(0, mesh.frontIndexCount, 0)
      geometry.addGroup(mesh.frontIndexCount, mesh.indices.length - mesh.frontIndexCount, 1)
      geometry.center()
      geometry.computeBoundingBox()
      const size = geometry.boundingBox?.getSize(new Vector3()) ?? new Vector3(1, 1, 1)
      const scale = MODEL_SIZE / Math.max(size.x, size.y)
      geometry.scale(scale, scale, scale)
      geometry.computeVertexNormals()
      garment.geometry.dispose()
      garment.geometry = geometry
      floor.position.y = (-size.y * scale) / 2 - 0.02
      fit()
      transition = null
      controls.enabled = true
      preset = 'front'
      camera.position.copy(presetPosition(preset))
      controls.target.set(0, 0, 0)
      controls.update()
    },

    setTextures(front, back) {
      ;[front, back].forEach((canvas, i) => {
        const texture = new CanvasTexture(canvas)
        texture.colorSpace = SRGBColorSpace
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
        materials[i].map?.dispose()
        materials[i].map = texture
        materials[i].needsUpdate = true
      })
      garment.visible = true
    },

    capturePng({ longSide, transparent }) {
      const { clientWidth, clientHeight } = host
      const { width, height } = snapshotSize(
        clientWidth / Math.max(1, clientHeight),
        longSide,
        renderer.capabilities.maxTextureSize
      )
      const previous = {
        background: scene.background,
        floor: floor.visible,
        ratio: renderer.getPixelRatio()
      }
      try {
        if (transparent) {
          scene.background = null
          renderer.setClearAlpha(0)
          floor.visible = false
        }
        renderer.setPixelRatio(1)
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.render(scene, camera)
        return pngFromDataUrl(renderer.domElement.toDataURL('image/png'))
      } finally {
        scene.background = previous.background
        renderer.setClearAlpha(1)
        floor.visible = previous.floor
        renderer.setPixelRatio(previous.ratio)
        renderer.setSize(clientWidth, clientHeight, false)
        camera.aspect = clientWidth / Math.max(1, clientHeight)
        camera.updateProjectionMatrix()
      }
    },

    setLighting(next) {
      applyLighting(next)
    },

    setPreset(next) {
      preset = next
      const to = new Spherical().setFromVector3(presetPosition(next))
      const from = new Spherical().setFromVector3(camera.position.clone().sub(controls.target))
      // Turn the short way round.
      if (to.theta - from.theta > Math.PI) to.theta -= 2 * Math.PI
      if (from.theta - to.theta > Math.PI) to.theta += 2 * Math.PI
      transition = { from, to, start: performance.now() }
      controls.enabled = false
    },

    dispose() {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      controls.dispose()
      garment.geometry.dispose()
      for (const m of materials) {
        m.map?.dispose()
        m.dispose()
      }
      floor.geometry.dispose()
      floor.material.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }
}
