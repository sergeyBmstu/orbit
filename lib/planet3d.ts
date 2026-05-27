import * as THREE from "three";
import type { PlanetParams } from "./fakedata";

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Draws an equirectangular surface map (longitude × latitude) ready to be wrapped on a sphere.
// Width:height should be 2:1 for proper spherical mapping.
export function drawPlanetTexture(canvas: HTMLCanvasElement, p: PlanetParams) {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  const rng = mulberry32(p.seed);

  // Base
  ctx.fillStyle = p.baseColor;
  ctx.fillRect(0, 0, w, h);

  // Horizontal latitude bands — full-width stripes that wrap seamlessly around the sphere
  for (let i = 0; i < p.bands; i++) {
    const t = (i + 0.5 + (rng() - 0.5) * 0.7) / p.bands;
    const y = t * h;
    const thickness = h * (0.04 + rng() * 0.09);
    const alpha = 0.45 + rng() * 0.4;
    const grad = ctx.createLinearGradient(0, y - thickness, 0, y + thickness);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.5, p.bandColor);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - thickness, w, thickness * 2);
    ctx.restore();
  }

  // Storms/spots — equirectangular ellipses, with x wrapping
  const drawSpot = (x: number, y: number, rx: number, ry: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, color);
    g.addColorStop(0.5, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  for (let i = 0; i < p.spots; i++) {
    const x = rng() * w;
    // bias toward equator to avoid weird polar pinching
    const y = h * (0.25 + rng() * 0.5);
    const rx = w * (0.04 + rng() * 0.08);
    const ry = rx * (0.4 + rng() * 0.5);
    const alpha = 0.55 + rng() * 0.35;
    drawSpot(x, y, rx, ry, p.spotColor, alpha);
    // wrap-around: if near right/left edge, draw mirror to make seamless
    if (x < w * 0.1) drawSpot(x + w, y, rx, ry, p.spotColor, alpha);
    if (x > w * 0.9) drawSpot(x - w, y, rx, ry, p.spotColor, alpha);
  }

  if (p.archetype === "ocean") {
    for (let i = 0; i < 10; i++) {
      const x = rng() * w;
      const y = h * (0.15 + rng() * 0.7);
      const rx = w * (0.06 + rng() * 0.1);
      const ry = rx * 0.45;
      drawSpot(x, y, rx, ry, "rgba(255,255,255,1)", 0.55);
      if (x < w * 0.1) drawSpot(x + w, y, rx, ry, "rgba(255,255,255,1)", 0.55);
      if (x > w * 0.9) drawSpot(x - w, y, rx, ry, "rgba(255,255,255,1)", 0.55);
    }
  }
}

// Soft sun surface — clean warm gradient with subtle low-frequency variation only.
// Discrete sunspots and granulation look "diseased" on a small sphere — keep it minimal.
export function drawSunTexture(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  const rng = mulberry32(99);

  // Warm base
  ctx.fillStyle = "#fff1c8";
  ctx.fillRect(0, 0, w, h);

  // Very subtle, large-scale warm patches to avoid a flat plastic look
  for (let i = 0; i < 18; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 90 + rng() * 140;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255, 200, 120, 0.35)");
    g.addColorStop(1, "rgba(255, 200, 120, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 10; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 80 + rng() * 120;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255, 255, 230, 0.4)");
    g.addColorStop(1, "rgba(255, 255, 230, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export type PlanetMesh = THREE.Group & {
  __planetCore?: THREE.Mesh;
  __spinSpeed?: number;
};

const _textureLoader = new THREE.TextureLoader();
const _texCache = new Map<string, THREE.Texture>();
function loadTextureCached(url: string): THREE.Texture {
  const cached = _texCache.get(url);
  if (cached) return cached;
  const tex = _textureLoader.load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  _texCache.set(url, tex);
  return tex;
}

export function createPlanetMesh(
  p: PlanetParams,
  options: { radius?: number; isMe?: boolean } = {}
): PlanetMesh {
  const radius = options.radius ?? 8;
  const group = new THREE.Group() as PlanetMesh;

  const texture = loadTextureCached(p.textureUrl);

  const surfaceMat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: p.archetype === "ocean" || p.archetype === "ice" ? 0.55 : 0.85,
    metalness: 0.0,
  });

  const core = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 48), surfaceMat);
  core.castShadow = false;
  core.receiveShadow = false;
  group.add(core);
  group.__planetCore = core;

  // Rings
  if (p.rings) {
    const ringCanvas = document.createElement("canvas");
    ringCanvas.width = 512;
    ringCanvas.height = 64;
    const rctx = ringCanvas.getContext("2d")!;
    const rng = mulberry32(p.seed + 1);
    rctx.clearRect(0, 0, 512, 64);
    for (let i = 0; i < 32; i++) {
      const x = i * 16;
      const stripeColor = rng() > 0.5 ? p.ringColor : "rgba(255,255,255,0.85)";
      rctx.fillStyle = stripeColor;
      rctx.globalAlpha = 0.55 + rng() * 0.4;
      rctx.fillRect(x, 0, 16, 64);
    }
    rctx.globalAlpha = 1;
    // Fade in/out edges via gradient overlay
    const fade = rctx.createLinearGradient(0, 0, 512, 0);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(0.08, "rgba(0,0,0,0)");
    fade.addColorStop(0.92, "rgba(0,0,0,0)");
    fade.addColorStop(1, "rgba(0,0,0,1)");
    rctx.globalCompositeOperation = "destination-out";
    rctx.fillStyle = fade;
    rctx.fillRect(0, 0, 512, 64);
    rctx.globalCompositeOperation = "source-over";

    const ringTex = new THREE.CanvasTexture(ringCanvas);
    ringTex.colorSpace = THREE.SRGBColorSpace;

    const ringInner = radius * 1.4;
    const ringOuter = radius * 2.1;
    const ringGeom = new THREE.RingGeometry(ringInner, ringOuter, 96, 1);
    // Remap UVs so the canvas wraps radially around the ring
    const uv = ringGeom.attributes.uv;
    const pos = ringGeom.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const r = Math.hypot(x, y);
      const angle = Math.atan2(y, x);
      uv.setXY(i, angle / (Math.PI * 2) + 0.5, (r - ringInner) / (ringOuter - ringInner));
    }
    uv.needsUpdate = true;

    const ringMat = new THREE.MeshBasicMaterial({
      map: ringTex,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = Math.PI / 2 - 0.35;
    ring.rotation.y = 0.15;
    group.add(ring);
  }

  group.__spinSpeed = 0.0015 + Math.random() * 0.003;
  return group;
}

export function createSunMesh(radius = 50): THREE.Group {
  const group = new THREE.Group();

  const loader = new THREE.TextureLoader();
  const sunTex = loader.load("/textures/sun.jpg");
  sunTex.colorSpace = THREE.SRGBColorSpace;
  sunTex.anisotropy = 8;

  // Photosphere with NASA-style real texture. Color pushed above 1 so bloom picks it up.
  const sunMat = new THREE.MeshBasicMaterial({
    map: sunTex,
    color: new THREE.Color(2.0, 1.6, 1.0),
    toneMapped: false,
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 64), sunMat);
  group.add(sphere);

  // Lens flare — billboarded radial glow that always faces the camera, no visible rings.
  // Loaded async so we don't block group construction.
  import("three/examples/jsm/objects/Lensflare.js").then(({ Lensflare, LensflareElement }) => {
    const flare0 = loader.load("/textures/lensflare0.png");
    const flare3 = loader.load("/textures/lensflare3.png");
    flare0.colorSpace = THREE.SRGBColorSpace;
    flare3.colorSpace = THREE.SRGBColorSpace;

    const lensflare = new Lensflare();
    // Main soft halo — kept tight (~3.5x the sun) so it doesn't visually swallow nearby planets
    lensflare.addElement(new LensflareElement(flare0, radius * 3.5, 0, new THREE.Color(1.0, 0.9, 0.7)));
    // Subtle ghosts along the camera-to-sun axis
    lensflare.addElement(new LensflareElement(flare3, 40, 0.5));
    lensflare.addElement(new LensflareElement(flare3, 60, 0.7));
    lensflare.addElement(new LensflareElement(flare3, 40, 0.9));
    group.add(lensflare);
  });

  (group as THREE.Group & { __spinSpeed?: number }).__spinSpeed = 0.0005;
  return group;
}
