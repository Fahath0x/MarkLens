import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local-first app: everything runs in the browser, so the build is a static
// bundle that can be dropped on any host. An absolute base keeps asset URLs
// correct even when a host rewrites unknown paths back to index.html (see
// vercel.json). Flip this to './' only if you host from a sub-directory.
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
})
