import { resolve } from 'path';
import { defineConfig } from 'electron-vite';

const rootDir = resolve(__dirname, '../..');

export default defineConfig({
  main: {
    envDir: rootDir,
    envPrefix: ['MAIN_VITE_', 'VITE_', 'CODEANY_'],
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, 'src/main.ts'),
        formats: ['cjs'],
        fileName: () => 'main.js'
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    }
  },
  preload: {
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, 'src/preload.ts'),
        formats: ['cjs'],
        fileName: () => 'preload.js'
      }
    }
  }
});
