import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, 'public')));
io.on('connection', (socket) => {
  console.log('New user join');
  socket.on('join-server', (s) => { socket.join(s); });
  socket.on('send-message', (data) => { io.to(data.server).emit('new-message', data); });
});
server.listen(3000, () => { console.log('Carlos Messenger dey run for http://localhost:3000'); });
