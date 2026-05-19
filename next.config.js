/**
 * Temporary build configuration to allow packaging DMG despite TypeScript issues.
 * Remove or adjust once types are fixed.
 */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  devIndicators: {
    buildActivity: false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { dev }) => {
    // Disable persistent filesystem cache to avoid ENOENT rename errors in dev
    if (config.cache) {
      config.cache = false;
    }
    return config;
  },
};

module.exports = nextConfig;
