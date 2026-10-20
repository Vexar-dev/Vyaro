/** @type {import('next').NextConfig} */
const skip = process.env.SKIP_TYPECHECK === 'true';
const nextConfig = {
  reactStrictMode: true,
  // في Docker نتجاوز فحص الأنواع/lint أثناء البناء (الكود لم يُبنَ من قبل). للفحص الصارم: SKIP_TYPECHECK=false
  typescript: { ignoreBuildErrors: skip },
  eslint: { ignoreDuringBuilds: skip },
};

module.exports = nextConfig;
