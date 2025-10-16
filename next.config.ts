import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Build sırasında ESLint hatalarını yoksay
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Derleme sırasında tip hataları olsa bile deploy’u durdurma
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
