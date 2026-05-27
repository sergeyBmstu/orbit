/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export — `next build` produces an `out/` dir that Express serves.
  output: "export",
  images: { unoptimized: true },
};

module.exports = nextConfig;
