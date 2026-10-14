import fs from 'node:fs';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Les modèles, sons et textures sont chargés à l'exécution par des chemins relatifs (« assets/… ») :
// ils sont recopiés tels quels dans dist/assets ; le code est regroupé dans dist/bundle.
const copyAssets = { name: 'copy-assets', closeBundle() { fs.cpSync('assets', 'dist/assets', { recursive: true }); } };

export default defineConfig(({ command }) => ({
  base: './',
  publicDir: false,
  plugins: command === 'serve' ? [basicSsl()] : [copyAssets], // WebXR exige HTTPS, y compris en local
  build: { target: 'es2022', assetsDir: 'bundle', chunkSizeWarningLimit: 3000 },
}));
