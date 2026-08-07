/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // `next build` e `next dev` condividono `.next`: lanciare il build mentre il
  // dev gira lascia il server a servire chunk CSS sostituiti e la pagina si
  // apre senza stili. Con NEXT_BUILD_DIR il build va altrove e non si toccano.
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  compiler: {
    // In produzione i console.log restano nel bundle e vengono spediti al
    // browser di chiunque apra la pagina. Errori e avvisi restano: servono.
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  experimental: {
    // Import a barile: `import { X } from 'pkg'` tirava dentro tutto il pacchetto.
    // lucide-react e date-fns sono già nella lista di Next, queste si aggiungono.
    optimizePackageImports: ["sonner", "@supabase/supabase-js", "@supabase/ssr"],
    // Cache del router lato client: tornare indietro non rifà il giro al server
    // per mezzo minuto. Le mutazioni la invalidano da sé via revalidatePath.
    staleTimes: { dynamic: 30, static: 300 },
  },
};

export default nextConfig;
