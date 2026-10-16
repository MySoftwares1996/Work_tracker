import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The Report tab shares the phone app's report engine (../src/workingDashboardReport.js and friends); the one thing those files
// import that a website lacks is React Native's AsyncStorage, which is replaced by an empty stand-in.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@react-native-async-storage/async-storage': fileURLToPath(new URL('./src/stubs/asyncStorage.js', import.meta.url)) } },
  server: { fs: { allow: ['..'] } },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Firebase and React rarely change: in their own files, a returning visitor (and the Android app) re-downloads only the small app file after a deploy.
    rollupOptions: { output: { manualChunks(id) {
      if (/node_modules\/(@firebase|firebase)\//.test(id)) return 'firebase';
      if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
      return undefined;
    } } },
  },
});
