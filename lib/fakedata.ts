export type FakeUser = {
  id: string;
  name: string;
  handle: string;
  bio: string;
  planet: PlanetParams;
  followingIds: string[];
};

export type PlanetParams = {
  baseColor: string;
  bandColor: string;
  spotColor: string;
  atmosphereColor: string;
  bands: number;
  spots: number;
  rings: boolean;
  ringColor: string;
  archetype: "gasWarm" | "gasCold" | "ice" | "rocky" | "lava" | "ocean";
  textureUrl: string;
  seed: number;
};

const TEXTURES: Record<PlanetParams["archetype"], string[]> = {
  gasWarm: ["/textures/jupiter.jpg"],
  gasCold: ["/textures/saturn.jpg"],
  ice: ["/textures/uranus.jpg", "/textures/neptune.jpg"],
  rocky: ["/textures/mercury.jpg", "/textures/mars.jpg", "/textures/moon.jpg"],
  lava: ["/textures/venus_surface.jpg"],
  ocean: ["/textures/earth_daymap.jpg"],
};

const FIRST_NAMES = [
  "Nova", "Orion", "Luna", "Vega", "Lyra", "Atlas", "Iris", "Sol",
  "Rhea", "Kepler", "Cosmo", "Astra", "Stella", "Nyx", "Helios", "Calix",
  "Mira", "Pollux", "Cassi", "Draco", "Phobos", "Titan", "Andro", "Sirius",
  "Galax", "Quark", "Pulsar", "Echo", "Zenith", "Aurora",
];

const LAST_NAMES = [
  "Wanderer", "Drifter", "Bloom", "Spark", "Reign", "Hollow", "Crest",
  "Whisper", "Flame", "Stone", "Vale", "Frost", "Glow", "Storm", "Tide",
  "Veil", "Forge", "Quill", "Ember", "Hex",
];

const BIOS = [
  "Mapping unknown asteroid belts.",
  "Collects moonstones in the Outer Rim.",
  "Broadcasting from the dark side.",
  "Trading spices across nebulae.",
  "Brewing comet tea since 2147.",
  "Singing to red giants.",
  "Lost in the Andromeda current.",
  "Engineer of orbital cathedrals.",
  "Watches supernovae for breakfast.",
  "Just a wanderer between galaxies.",
  "Speaks fluent gravity.",
  "Looking for kindred orbits.",
];

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function jitter(h: number, rng: () => number, range = 20) {
  return Math.round(h + (rng() - 0.5) * range);
}

type Archetype = PlanetParams["archetype"];

function paletteFor(arch: Archetype, rng: () => number) {
  const j = (n: number, r = 15) => jitter(n, rng, r);
  switch (arch) {
    case "gasWarm": // Jupiter
      return {
        base: `hsl(${j(34)}, 55%, 55%)`,
        band: `hsl(${j(28)}, 50%, 38%)`,
        spot: `hsl(${j(18)}, 70%, 45%)`,
        atmo: `hsl(${j(40)}, 80%, 80%)`,
        ringHue: 38,
      };
    case "gasCold": // Saturn / pale cream
      return {
        base: `hsl(${j(45)}, 45%, 70%)`,
        band: `hsl(${j(38)}, 40%, 55%)`,
        spot: `hsl(${j(30)}, 50%, 60%)`,
        atmo: `hsl(${j(50)}, 70%, 85%)`,
        ringHue: 45,
      };
    case "ice": // Neptune / Uranus
      return {
        base: `hsl(${j(210)}, 55%, 50%)`,
        band: `hsl(${j(205)}, 60%, 40%)`,
        spot: `hsl(${j(195)}, 70%, 75%)`,
        atmo: `hsl(${j(200)}, 80%, 80%)`,
        ringHue: 200,
      };
    case "rocky": // Mars
      return {
        base: `hsl(${j(18)}, 50%, 45%)`,
        band: `hsl(${j(15)}, 55%, 30%)`,
        spot: `hsl(${j(25)}, 40%, 55%)`,
        atmo: `hsl(${j(20)}, 70%, 70%)`,
        ringHue: 20,
      };
    case "lava":
      return {
        base: `hsl(${j(10)}, 75%, 35%)`,
        band: `hsl(${j(35)}, 90%, 55%)`,
        spot: `hsl(${j(50)}, 100%, 65%)`,
        atmo: `hsl(${j(20)}, 100%, 70%)`,
        ringHue: 10,
      };
    case "ocean": // Earth-like
      return {
        base: `hsl(${j(215)}, 60%, 40%)`,
        band: `hsl(${j(140)}, 45%, 40%)`,
        spot: `hsl(${j(200)}, 30%, 95%)`,
        atmo: `hsl(${j(200)}, 80%, 80%)`,
        ringHue: 200,
      };
  }
}

function makePlanet(seed: number): PlanetParams {
  const rng = mulberry32(seed);
  const archetypes: Archetype[] = [
    "gasWarm",
    "gasCold",
    "ice",
    "ice",
    "rocky",
    "rocky",
    "rocky",
    "ocean",
    "lava",
  ];
  const archetype = archetypes[Math.floor(rng() * archetypes.length)];
  const pal = paletteFor(archetype, rng);
  const isGas = archetype === "gasWarm" || archetype === "gasCold";
  const textures = TEXTURES[archetype];
  const textureUrl = textures[Math.floor(rng() * textures.length)];

  return {
    baseColor: pal.base,
    bandColor: pal.band,
    spotColor: pal.spot,
    atmosphereColor: pal.atmo,
    bands: isGas ? 6 + Math.floor(rng() * 4) : 2 + Math.floor(rng() * 3),
    spots: 2 + Math.floor(rng() * 4),
    // Saturn texture already shows rings on the body so it's redundant to add 3D rings
    // for it — keep rings only for non-saturn gas giants or random others
    rings: rng() > 0.78,
    ringColor: `hsl(${pal.ringHue}, 50%, 75%)`,
    archetype,
    textureUrl,
    seed,
  };
}

export function generateUsers(count: number): FakeUser[] {
  const rng = mulberry32(42);
  const users: FakeUser[] = [];

  for (let i = 0; i < count; i++) {
    const first = pick(FIRST_NAMES, rng);
    const last = pick(LAST_NAMES, rng);
    users.push({
      id: `u${i}`,
      name: `${first} ${last}`,
      handle: `${first.toLowerCase()}_${last.toLowerCase()}`,
      bio: pick(BIOS, rng),
      planet: makePlanet(Math.floor(rng() * 1_000_000)),
      followingIds: [],
    });
  }

  // Seed follow edges (each user follows 1-2 random others)
  for (const u of users) {
    const k = 1 + Math.floor(rng() * 2);
    const set = new Set<string>();
    while (set.size < k) {
      const target = users[Math.floor(rng() * users.length)];
      if (target.id !== u.id) set.add(target.id);
    }
    u.followingIds = Array.from(set);
  }

  return users;
}
