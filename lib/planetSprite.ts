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

function softFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  alpha: number
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, color);
  g.addColorStop(0.6, color);
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
}

export function drawPlanet(canvas: HTMLCanvasElement, p: PlanetParams) {
  const ctx = canvas.getContext("2d")!;
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;
  const rng = mulberry32(p.seed);

  ctx.clearRect(0, 0, size, size);

  // Rings — drawn BEHIND the planet using a gradient ellipse
  if (p.rings) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.35);
    const ringOuter = radius * 2.05;
    const ringInner = radius * 1.35;
    const grad = ctx.createLinearGradient(-ringOuter, 0, ringOuter, 0);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.15, p.ringColor);
    grad.addColorStop(0.5, "rgba(255,255,255,0.85)");
    grad.addColorStop(0.85, p.ringColor);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    // back half of the ring (above planet from camera POV)
    ctx.beginPath();
    ctx.ellipse(0, 0, ringOuter, ringOuter * 0.18, 0, Math.PI, Math.PI * 2);
    ctx.ellipse(0, 0, ringInner, ringInner * 0.18, 0, Math.PI * 2, Math.PI, true);
    ctx.fill();
    ctx.restore();
  }

  // Atmospheric glow behind the planet
  const haze = ctx.createRadialGradient(cx, cy, radius * 0.9, cx, cy, radius * 1.35);
  haze.addColorStop(0, p.atmosphereColor.replace("hsl", "hsla").replace(")", ", 0.55)"));
  haze.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = haze;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.35, 0, Math.PI * 2);
  ctx.fill();

  // Planet disc clip
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  // Base color
  ctx.fillStyle = p.baseColor;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // Soft horizontal bands with feathered edges
  for (let i = 0; i < p.bands; i++) {
    const t = (i + 0.5 + (rng() - 0.5) * 0.6) / p.bands;
    const y = cy - radius + t * radius * 2;
    const h = radius * (0.06 + rng() * 0.16);
    const alpha = 0.35 + rng() * 0.35;
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.5, p.bandColor);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = grad;
    ctx.fillRect(cx - radius, y, radius * 2, h);
    ctx.restore();
  }

  // Storms / spots — soft elongated blobs
  for (let i = 0; i < p.spots; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * radius * 0.7;
    const sx = cx + Math.cos(angle) * dist;
    const sy = cy + Math.sin(angle) * dist;
    const rx = radius * (0.06 + rng() * 0.14);
    const ry = rx * (0.4 + rng() * 0.5); // elongated horizontally like real storms
    const alpha = 0.45 + rng() * 0.4;
    softFill(ctx, sx, sy, rx, ry, p.spotColor, alpha);
  }

  // For ocean type, add white cloud swirls
  if (p.archetype === "ocean") {
    for (let i = 0; i < 6; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = rng() * radius * 0.75;
      const sx = cx + Math.cos(angle) * dist;
      const sy = cy + Math.sin(angle) * dist;
      const rx = radius * (0.1 + rng() * 0.18);
      const ry = rx * 0.45;
      softFill(ctx, sx, sy, rx, ry, "rgba(255,255,255,1)", 0.55);
    }
  }

  // Sphere shading — bright highlight on upper-left, dark terminator on lower-right
  const light = ctx.createRadialGradient(
    cx - radius * 0.45,
    cy - radius * 0.45,
    radius * 0.05,
    cx - radius * 0.45,
    cy - radius * 0.45,
    radius * 0.9
  );
  light.addColorStop(0, "rgba(255,255,255,0.45)");
  light.addColorStop(0.6, "rgba(255,255,255,0)");
  ctx.fillStyle = light;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  const shadow = ctx.createRadialGradient(
    cx + radius * 0.6,
    cy + radius * 0.6,
    radius * 0.1,
    cx,
    cy,
    radius * 1.1
  );
  shadow.addColorStop(0, "rgba(0,0,0,0.65)");
  shadow.addColorStop(0.5, "rgba(0,0,0,0.25)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadow;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  ctx.restore();

  // Atmospheric rim light (after clip is removed, drawn around the disc edge)
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.02, 0, Math.PI * 2);
  ctx.lineWidth = radius * 0.07;
  ctx.strokeStyle = p.atmosphereColor;
  ctx.globalAlpha = 0.35;
  ctx.stroke();
  ctx.restore();

  // Front half of the ring (overlapping the planet's lower equator)
  if (p.rings) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.35);
    const ringOuter = radius * 2.05;
    const ringInner = radius * 1.35;
    const grad = ctx.createLinearGradient(-ringOuter, 0, ringOuter, 0);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.2, p.ringColor);
    grad.addColorStop(0.5, "rgba(255,255,255,0.85)");
    grad.addColorStop(0.8, p.ringColor);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, ringOuter, ringOuter * 0.18, 0, 0, Math.PI);
    ctx.ellipse(0, 0, ringInner, ringInner * 0.18, 0, Math.PI, 0, true);
    ctx.fill();
    ctx.restore();
  }
}

export function createStarSprite(): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const cx = 256;
  const cy = 256;
  const surfaceR = 70;

  // Outermost soft corona
  const corona = ctx.createRadialGradient(cx, cy, surfaceR * 0.9, cx, cy, 240);
  corona.addColorStop(0, "rgba(255, 180, 90, 0.55)");
  corona.addColorStop(0.25, "rgba(255, 150, 70, 0.22)");
  corona.addColorStop(0.6, "rgba(255, 120, 50, 0.07)");
  corona.addColorStop(1, "rgba(255, 100, 40, 0)");
  ctx.fillStyle = corona;
  ctx.fillRect(0, 0, 512, 512);

  // Inner corona / chromosphere
  const inner = ctx.createRadialGradient(cx, cy, surfaceR * 0.6, cx, cy, surfaceR * 1.7);
  inner.addColorStop(0, "rgba(255, 220, 140, 0.9)");
  inner.addColorStop(0.5, "rgba(255, 180, 90, 0.5)");
  inner.addColorStop(1, "rgba(255, 140, 60, 0)");
  ctx.fillStyle = inner;
  ctx.fillRect(0, 0, 512, 512);

  // Photosphere — the solid disc
  const disc = ctx.createRadialGradient(cx, cy, surfaceR * 0.2, cx, cy, surfaceR);
  disc.addColorStop(0, "rgba(255, 252, 230, 1)");
  disc.addColorStop(0.55, "rgba(255, 230, 150, 1)");
  disc.addColorStop(0.9, "rgba(255, 190, 90, 1)");
  disc.addColorStop(1, "rgba(255, 160, 70, 0.9)");
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(cx, cy, surfaceR, 0, Math.PI * 2);
  ctx.fill();

  // Surface granulation — darker mottling clipped to the disc
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, surfaceR, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * surfaceR * 0.85;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const rad = 4 + Math.random() * 9;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, "rgba(220, 110, 40, 0.35)");
    g.addColorStop(1, "rgba(220, 110, 40, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Subtle bright limb highlight on the upper-left
  const limb = ctx.createRadialGradient(
    cx - surfaceR * 0.35,
    cy - surfaceR * 0.35,
    surfaceR * 0.1,
    cx,
    cy,
    surfaceR
  );
  limb.addColorStop(0, "rgba(255, 255, 240, 0.35)");
  limb.addColorStop(0.6, "rgba(255, 255, 240, 0)");
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, surfaceR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = limb;
  ctx.fillRect(0, 0, 512, 512);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(180, 180, 1);
  return sprite;
}

export function createPlanetSprite(
  p: PlanetParams,
  highlight = false,
  selected = false
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const cx = 128;
  const cy = 128;

  if (selected) {
    const glow = ctx.createRadialGradient(cx, cy, 60, cx, cy, 124);
    glow.addColorStop(0, "rgba(120, 220, 255, 0.55)");
    glow.addColorStop(0.5, "rgba(120, 220, 255, 0.18)");
    glow.addColorStop(1, "rgba(120, 220, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 256, 256);
  }

  // drawPlanet expects the disc centered, radius = size * 0.38 — we just feed it the bigger canvas.
  drawPlanet(canvas, p);

  if (selected) {
    ctx.strokeStyle = "rgba(140, 230, 255, 0.95)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 100, 0, Math.PI * 2);
    ctx.stroke();
  } else if (highlight) {
    ctx.strokeStyle = "rgba(255, 220, 120, 0.9)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, 100, 0, Math.PI * 2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  const size = selected ? 38 : 26;
  sprite.scale.set(size, size, 1);
  return sprite;
}
