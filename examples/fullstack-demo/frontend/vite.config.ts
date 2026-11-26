import { defineConfig } from 'vite';
import { tokensafeUi } from 'tokensafe-ui/vite';

// The plugin mounts the OUMV JSON-RPC bridge at /__oumv/rpc in dev mode,
// injects data-agent-id attributes, and writes the .tokensafe/runtime.json
// discovery beacon for the TokenSafe OUMV Gateway.
export default defineConfig({
  plugins: [tokensafeUi()],
  server: {
    port: 5173,
    proxy: {
      // Frontend calls /api/* — proxy to the FastAPI backend during dev.
      '/api': 'http://127.0.0.1:8000',
    },
  },
});
