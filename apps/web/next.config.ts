import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@clipmaker/db', '@clipmaker/types', '@clipmaker/queue', '@clipmaker/config'],
  experimental: {
    serverActions: {
      bodySizeLimit: '4gb',
    },
  },
};

export default nextConfig;
