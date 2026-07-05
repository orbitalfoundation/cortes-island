// Socket connection — same-origin like orbital-jam: vite proxies in dev,
// the server serves the built client in prod.

import { io } from 'socket.io-client';

export async function connect({ onItem }) {
  const config = await (await fetch('/api/config')).json();
  const socket = io({ transports: ['websocket'] });

  socket.on('connect', () => {
    socket.emit('items', { query: { limit: 800 } }, (res) => {
      if (res?.ok) for (const item of res.items) onItem(item);
    });
  });
  socket.on('item', (item) => onItem(item));

  return { config, socket };
}
