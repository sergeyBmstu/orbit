"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { FakeUser } from "@/lib/fakedata";
import { createPlanetMesh, createSunMesh } from "@/lib/planet3d";

const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), { ssr: false });

type GraphNode = {
  id: string;
  user: FakeUser | null;
  isMe: boolean;
  isStar?: boolean;
};
type GraphLink = { source: string; target: string };

const ME_ID = "me";
const STAR_ID = "star";
const ORBIT_RADIUS = 380;
const STORAGE_KEY = "planet-graph-following-v1";

function loadFollowing(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveFollowing(set: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
}

export default function Page() {
  const [users, setUsers] = useState<FakeUser[] | null>(null);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const fgRef = useRef<unknown>(null);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => setUsers(data.users as FakeUser[]));
    setFollowing(loadFollowing());

    const update = () =>
      setSize({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!users) return;
    const fg = fgRef.current as {
      d3Force: (
        name: string,
        force?: unknown
      ) => { strength?: (n: number | ((d: unknown) => number)) => unknown; distance?: (n: number) => unknown } | undefined;
      d3ReheatSimulation: () => void;
      cameraPosition: (
        pos: { x?: number; y?: number; z?: number },
        lookAt?: { x: number; y: number; z: number },
        ms?: number
      ) => void;
    } | null;
    if (!fg) return;

    // Library auto-zooms based on cbrt(nodeCount) * 170 right after data is set,
    // which clobbers any earlier cameraPosition call. Defer ours to win the race.
    const cameraTimer = window.setTimeout(() => {
      fg.cameraPosition({ x: 0, y: 0, z: 520 }, { x: 0, y: 0, z: 0 }, 0);
    }, 50);

    // Install lights and bloom postprocessing on the scene
    const fgFull = fgRef.current as unknown as {
      scene: () => THREE.Scene;
      lights: (l?: THREE.Light[]) => unknown;
      postProcessingComposer: () => {
        addPass: (p: unknown) => void;
        passes: { constructor: { name: string } }[];
      };
      renderer: () => THREE.WebGLRenderer;
    };
    try {
      const sunLight = new THREE.PointLight(0xffe7b0, 4.5, 0, 1.6);
      sunLight.position.set(0, 0, 0);
      const ambient = new THREE.AmbientLight(0x6080a0, 0.18);
      fgFull.lights([sunLight, ambient]);

      const renderer = fgFull.renderer();
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      const composer = fgFull.postProcessingComposer();
      // Avoid double-adding bloom on re-mount
      const hasBloom = composer.passes.some((p) => p.constructor.name === "UnrealBloomPass");
      if (!hasBloom) {
        import("three/examples/jsm/postprocessing/UnrealBloomPass.js").then(({ UnrealBloomPass }) => {
          const bloom = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.45, // strength — gentle so the sun's bloom doesn't engulf planets behind it
            0.5, // radius
            0.55 // threshold — only the brightest pixels bloom
          );
          composer.addPass(bloom);
        });
      }
    } catch {
      // best-effort — if the library shape changes, skip extras
    }

    let cancelled = false;
    import("d3-force-3d").then((d3) => {
      if (cancelled) return;
      // Pull toward the orbit sphere — they can settle anywhere on it
      const radial = d3
        .forceRadial(ORBIT_RADIUS, 0, 0, 0)
        .strength((n: { isStar?: boolean }) => (n.isStar ? 0 : 0.45));
      fg.d3Force("radial", radial);
      // Flatten toward the ecliptic plane (y = 0). Combined with radial, this turns
      // the spherical orbit into a thin disc.
      const flatten = d3
        .forceY(0)
        .strength((n: { isStar?: boolean }) => (n.isStar ? 0 : 0.2));
      fg.d3Force("flatten", flatten);
      fg.d3Force("charge")?.strength?.(-60);
      fg.d3Force("link")?.distance?.(60);
      const collide = d3.forceCollide((n: { isStar?: boolean; isMe?: boolean }) =>
        n.isStar ? 70 : n.isMe ? 16 : 12
      ).strength(0.95);
      fg.d3Force("collide", collide);
      fg.d3ReheatSimulation();
    });

    // Rotation animation independent of physics simulation
    let raf = 0;
    const tick = () => {
      const scene = fgFull?.scene?.();
      if (scene) {
        scene.traverse((obj) => {
          const o = obj as THREE.Object3D & { __spinSpeed?: number };
          if (o.__spinSpeed) o.rotation.y += o.__spinSpeed;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      window.clearTimeout(cameraTimer);
      cancelAnimationFrame(raf);
    };
  }, [users]);

  const me: FakeUser = useMemo(
    () => ({
      id: ME_ID,
      name: "You",
      handle: "you",
      bio: "Your home planet. Click others to follow them.",
      planet: {
        baseColor: "hsl(215, 60%, 42%)",
        bandColor: "hsl(140, 45%, 42%)",
        spotColor: "hsl(200, 30%, 96%)",
        atmosphereColor: "hsl(200, 80%, 80%)",
        bands: 3,
        spots: 4,
        rings: true,
        ringColor: "hsl(200, 50%, 78%)",
        archetype: "ocean",
        textureUrl: "/textures/earth_daymap.jpg",
        seed: 7777,
      },
      followingIds: [],
    }),
    []
  );

  const graphData = useMemo(() => {
    if (!users) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };

    // Seed each non-star planet near the ecliptic plane (y ≈ 0) at orbit radius.
    // Real solar systems are roughly flat — a full sphere distribution looked wrong.
    const sphericalSeed = (seed: number) => {
      const r = (s: number) => {
        let t = (s + 0x6d2b79f5) >>> 0;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const u1 = r(seed * 2 + 1);
      const u2 = r(seed * 2 + 2);
      const theta = u1 * Math.PI * 2; // angle around the disc
      // small vertical jitter (~±25 units of inclination) — flat-ish system
      const yJitter = (u2 - 0.5) * 50;
      // radial scatter on the disc so they're not all on exact same circle
      const radial = ORBIT_RADIUS + (r(seed * 2 + 3) - 0.5) * 50;
      return {
        x: radial * Math.cos(theta),
        y: yJitter,
        z: radial * Math.sin(theta),
      };
    };

    const nodes: GraphNode[] = [
      {
        id: STAR_ID,
        user: null,
        isMe: false,
        isStar: true,
        // d3-force reads fx/fy/fz to pin the node at the origin
        ...({ fx: 0, fy: 0, fz: 0 } as object),
      },
      { id: me.id, user: me, isMe: true, ...(sphericalSeed(me.planet.seed) as object) },
      ...users.map((u, i) => ({
        id: u.id,
        user: u,
        isMe: false,
        ...(sphericalSeed(u.planet.seed + i) as object),
      })),
    ];

    const links: GraphLink[] = [];
    for (const u of users) {
      for (const target of u.followingIds) {
        links.push({ source: u.id, target });
      }
    }
    for (const targetId of following) {
      links.push({ source: ME_ID, target: targetId });
    }
    return { nodes, links };
  }, [users, following, me]);

  const selectedUser = useMemo(() => {
    if (!selectedId || !users) return null;
    if (selectedId === ME_ID) return me;
    return users.find((u) => u.id === selectedId) ?? null;
  }, [selectedId, users, me]);

  const userById = useMemo(() => {
    const m = new Map<string, FakeUser>();
    if (users) for (const u of users) m.set(u.id, u);
    m.set(ME_ID, me);
    return m;
  }, [users, me]);

  const connections = useMemo(() => {
    if (!selectedUser || !users) return { followingList: [], followersList: [] };
    let followingIds: string[];
    if (selectedUser.id === ME_ID) {
      followingIds = Array.from(following);
    } else {
      followingIds = selectedUser.followingIds;
    }
    const followersList: FakeUser[] = [];
    for (const u of users) {
      if (u.followingIds.includes(selectedUser.id)) followersList.push(u);
    }
    if (selectedUser.id !== ME_ID && following.has(selectedUser.id)) {
      followersList.unshift(me);
    }
    const followingList = followingIds
      .map((id) => userById.get(id))
      .filter((u): u is FakeUser => !!u);
    return { followingList, followersList };
  }, [selectedUser, users, following, userById, me]);

  const toggleFollow = useCallback((id: string) => {
    setFollowing((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFollowing(next);
      return next;
    });
  }, []);

  const nodeThreeObject = useCallback(
    (node: unknown) => {
      const n = node as GraphNode;
      if (n.isStar) return createSunMesh(50);
      const isSelected = n.id === selectedId;
      const baseRadius = n.isMe ? 11 : 8;
      const radius = isSelected ? baseRadius * 1.4 : baseRadius;
      const mesh = createPlanetMesh(n.user!.planet, { radius, isMe: n.isMe });
      // Highlight ring (selected = cyan, followed = gold) as a flat torus
      if (isSelected || n.isMe || following.has(n.id)) {
        const color = isSelected ? 0x8ce6ff : 0xffdc78;
        const ringGeom = new THREE.TorusGeometry(radius * 1.35, radius * 0.04, 12, 64);
        const ringMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.85,
          toneMapped: false,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = Math.PI / 2;
        mesh.add(ring);
      }
      return mesh;
    },
    [following, selectedId]
  );

  const handleNodeClick = useCallback(async (node: unknown) => {
    const n = node as GraphNode & { x?: number; y?: number; z?: number };
    if (n.isStar) {
      const QRCode = await import("qrcode");
      const url = await QRCode.toDataURL(window.location.href, {
        width: 360,
        margin: 1,
        color: { dark: "#0b0c14", light: "#e7eaf6" },
      });
      setQrUrl(url);
      return;
    }
    setSelectedId(n.id);
    const fg = fgRef.current as {
      cameraPosition: (
        pos: { x?: number; y?: number; z?: number },
        lookAt?: { x: number; y: number; z: number },
        ms?: number
      ) => void;
    } | null;
    if (!fg || n.x === undefined || n.y === undefined || n.z === undefined) return;
    // Move camera along the ray from origin through the node, stopping short by `offset` units.
    const len = Math.hypot(n.x, n.y, n.z) || 1;
    const offset = 120;
    const k = (len + offset) / len;
    fg.cameraPosition(
      { x: n.x * k, y: n.y * k, z: n.z * k },
      { x: n.x, y: n.y, z: n.z },
      900
    );
  }, []);

  const handleDeselect = useCallback(() => {
    setSelectedId(null);
    const fg = fgRef.current as {
      cameraPosition: (
        pos: { x?: number; y?: number; z?: number },
        lookAt?: { x: number; y: number; z: number },
        ms?: number
      ) => void;
    } | null;
    if (!fg) return;
    fg.cameraPosition({ x: 0, y: 0, z: 520 }, { x: 0, y: 0, z: 0 }, 900);
  }, []);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", background: "#05060d" }}>
      {users && (
        <ForceGraph3D
          ref={fgRef as never}
          graphData={graphData}
          width={size.w}
          height={size.h}
          backgroundColor="#05060d"
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={false}
          linkColor={(link: unknown) => {
            const l = link as { source: GraphNode | string; target: GraphNode | string };
            const sourceId = typeof l.source === "string" ? l.source : l.source.id;
            const targetId = typeof l.target === "string" ? l.target : l.target.id;
            const touchesSelected =
              selectedId !== null && (sourceId === selectedId || targetId === selectedId);
            if (!touchesSelected) return "rgba(0, 0, 0, 0)";
            return sourceId === ME_ID
              ? "rgba(255, 220, 120, 0.95)"
              : "rgba(150, 190, 255, 0.7)";
          }}
          linkWidth={(link: unknown) => {
            const l = link as { source: GraphNode | string; target: GraphNode | string };
            const sourceId = typeof l.source === "string" ? l.source : l.source.id;
            const targetId = typeof l.target === "string" ? l.target : l.target.id;
            const touchesSelected =
              selectedId !== null && (sourceId === selectedId || targetId === selectedId);
            return touchesSelected ? 0.9 : 0;
          }}
          linkOpacity={1}
          linkPositionUpdate={(lineObj: unknown, coords: unknown, link: unknown) => {
            const root = lineObj as THREE.Object3D & {
              children: THREE.Object3D[];
              geometry?: THREE.BufferGeometry;
              type: string;
            };
            const { start, end } = coords as {
              start: { x: number; y: number; z: number };
              end: { x: number; y: number; z: number };
            };
            const l = link as { source: GraphNode; target: GraphNode };
            const srcR = l.source.isStar ? 52 : l.source.isMe ? 12 : 9;
            const tgtR = l.target.isStar ? 52 : l.target.isMe ? 12 : 9;
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const dz = end.z - start.z;
            const dist = Math.hypot(dx, dy, dz) || 1;
            if (dist < srcR + tgtR) return false;
            const nx = dx / dist, ny = dy / dist, nz = dz / dist;
            const sx = start.x + nx * srcR;
            const sy = start.y + ny * srcR;
            const sz = start.z + nz * srcR;
            const ex = end.x - nx * tgtR;
            const ey = end.y - ny * tgtR;
            const ez = end.z - nz * tgtR;

            const target = (root.children && root.children.length ? root.children[0] : root) as THREE.Object3D & {
              type: string;
              geometry: THREE.BufferGeometry;
            };

            if (target.type === "Line") {
              const pos = target.geometry.getAttribute("position");
              if (!pos || pos.array.length < 6) return false;
              const arr = pos.array as Float32Array;
              arr[0] = sx; arr[1] = sy; arr[2] = sz;
              arr[3] = ex; arr[4] = ey; arr[5] = ez;
              (pos as THREE.BufferAttribute).needsUpdate = true;
              target.geometry.computeBoundingSphere();
              return true;
            }

            if (target.type === "Mesh") {
              const mesh = target as THREE.Mesh;
              const vStart = new THREE.Vector3(sx, sy, sz);
              const vEnd = new THREE.Vector3(ex, ey, ez);
              mesh.position.copy(vStart);
              mesh.scale.set(1, 1, vStart.distanceTo(vEnd));
              if (mesh.parent) mesh.parent.localToWorld(vEnd);
              mesh.lookAt(vEnd);
              return true;
            }

            return false;
          }}
          enableNodeDrag={false}
          onNodeClick={handleNodeClick}
        />
      )}

      <div style={overlayHeader}>
        <h1 style={{ margin: 0, fontSize: 18, letterSpacing: 1 }}>
          PLANET GRAPH
        </h1>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          You follow {following.size} of {users?.length ?? 0} planets
        </div>
      </div>

      {selectedUser && (
        <aside style={sidePanel}>
          <button style={closeBtn} onClick={handleDeselect}>
            ×
          </button>
          <PlanetPreview user={selectedUser} />
          <h2 style={{ margin: "12px 0 4px", fontSize: 22 }}>
            {selectedUser.name}
          </h2>
          <div style={{ opacity: 0.6, fontSize: 13 }}>
            @{selectedUser.handle}
          </div>
          <p style={{ marginTop: 14, lineHeight: 1.5, opacity: 0.85, fontSize: 14 }}>
            {selectedUser.bio}
          </p>

          <ConnectionList
            label={`Following · ${connections.followingList.length}`}
            users={connections.followingList}
            onSelect={(id) => {
              const node = (graphData.nodes as (GraphNode & { x?: number; y?: number; z?: number })[])
                .find((n) => n.id === id);
              if (node) handleNodeClick(node);
            }}
          />
          <ConnectionList
            label={`Followers · ${connections.followersList.length}`}
            users={connections.followersList}
            onSelect={(id) => {
              const node = (graphData.nodes as (GraphNode & { x?: number; y?: number; z?: number })[])
                .find((n) => n.id === id);
              if (node) handleNodeClick(node);
            }}
          />
        </aside>
      )}

      <div style={legend}>
        Drag to rotate · scroll to zoom · click a planet · click the star to share
      </div>

      {qrUrl && (
        <div
          style={qrBackdrop}
          onClick={() => setQrUrl(null)}
        >
          <div style={qrCard} onClick={(e) => e.stopPropagation()}>
            <button style={closeBtn} onClick={() => setQrUrl(null)}>×</button>
            <div style={{ fontSize: 11, letterSpacing: 2, opacity: 0.5, textTransform: "uppercase", marginBottom: 8 }}>
              Join the orbit
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 18 }}>
              Scan to enter the system
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt="QR code"
              width={280}
              height={280}
              style={{ display: "block", borderRadius: 10 }}
            />
            <div style={{ marginTop: 14, fontSize: 12, opacity: 0.5, wordBreak: "break-all", textAlign: "center" }}>
              {typeof window !== "undefined" ? window.location.href : ""}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanetPreview({ user }: { user: FakeUser }) {
  // Equirectangular maps are 2:1 — take a square crop from the center longitude
  // and clip to a circle for a "planet face" thumbnail.
  return (
    <div
      style={{
        width: 160,
        height: 160,
        borderRadius: "50%",
        margin: "0 auto",
        backgroundImage: `url(${user.planet.textureUrl})`,
        backgroundSize: "320px 160px",
        backgroundPosition: "center center",
        boxShadow:
          "inset -22px -22px 40px rgba(0,0,0,0.55), inset 18px 18px 30px rgba(255,255,255,0.08)",
      }}
    />
  );
}

function ConnectionList({
  label,
  users,
  onSelect,
}: {
  label: string;
  users: FakeUser[];
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1.5,
          opacity: 0.5,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {users.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.4 }}>— none —</div>
      ) : (
        <div style={{ maxHeight: 130, overflowY: "auto", margin: "0 -6px" }}>
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => onSelect(u.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "5px 6px",
                background: "transparent",
                border: "none",
                color: "#e7eaf6",
                cursor: "pointer",
                borderRadius: 6,
                fontSize: 13,
                textAlign: "left",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.06)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <ConnectionDot user={u} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {u.name}
              </span>
              <span style={{ fontSize: 11, opacity: 0.4 }}>@{u.handle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectionDot({ user }: { user: FakeUser }) {
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        flexShrink: 0,
        backgroundImage: `url(${user.planet.textureUrl})`,
        backgroundSize: "44px 22px",
        backgroundPosition: "center center",
        boxShadow: "inset -3px -3px 6px rgba(0,0,0,0.55)",
      }}
    />
  );
}

const overlayHeader: React.CSSProperties = {
  position: "absolute",
  top: 20,
  left: 24,
  color: "#e7eaf6",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  pointerEvents: "none",
};

const sidePanel: React.CSSProperties = {
  position: "absolute",
  top: 20,
  right: 20,
  width: 280,
  padding: "20px 22px",
  background: "rgba(12, 14, 24, 0.85)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  backdropFilter: "blur(10px)",
  color: "#e7eaf6",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
};

const closeBtn: React.CSSProperties = {
  position: "absolute",
  top: 8,
  right: 12,
  background: "transparent",
  border: "none",
  color: "#e7eaf6",
  fontSize: 22,
  cursor: "pointer",
  opacity: 0.6,
};

const followBtn: React.CSSProperties = {
  width: "100%",
  marginTop: 18,
  padding: "10px 16px",
  borderRadius: 10,
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  transition: "background 0.15s",
};

const legend: React.CSSProperties = {
  position: "absolute",
  bottom: 18,
  left: 24,
  color: "rgba(231, 234, 246, 0.4)",
  fontSize: 12,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  pointerEvents: "none",
};

const qrBackdrop: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(5, 6, 13, 0.7)",
  backdropFilter: "blur(6px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const qrCard: React.CSSProperties = {
  position: "relative",
  padding: "32px 36px",
  background: "rgba(15, 18, 30, 0.96)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 16,
  color: "#e7eaf6",
  textAlign: "center",
  width: 360,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
};
