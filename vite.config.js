import { defineConfig } from 'vite';

// En GitHub Pages el repositorio se sirve bajo /HidroBalc-n/
// Si se corre en desarrollo local o Capacitor, base debe ser '/' o './'
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/HidroBalc-n/' : './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
