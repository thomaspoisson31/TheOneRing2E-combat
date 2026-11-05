import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// Génère public/images/battlemaps.json : liste alphabétique des images "LAU-Stance-Mat*"
function battlemapManifest(): Plugin {
  return {
    name: 'battlemap-manifest',
    buildStart() {
      const dir = path.resolve(__dirname, 'public/images');
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith('LAU-Stance-Mat') && /\.(jpe?g|png|webp|gif)$/i.test(f))
        .sort((a, b) => a.localeCompare(b));
      fs.writeFileSync(path.join(dir, 'battlemaps.json'), JSON.stringify(files, null, 2));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), battlemapManifest()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
