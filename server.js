const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 8;

const NAMES = ['Dmitri','Natasha','Boris','Olga','Ivan','Svetlana','Alexei','Mikhail'];
const COLORS = ['#e63946','#457b9d','#2a9d8f','#e9c46a','#f4a261','#a855f7','#06b6d4','#ec4899'];

const wss = new WebSocketServer({ port: PORT });

let nextId = 1;
const players = new Map(); // id -> { ws, id, name, color }
const usedColors = new Set();

function pickColor() {
    for (const c of COLORS) {
        if (!usedColors.has(c)) return c;
    }
    return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function pickName() {
    const usedNames = new Set([...players.values()].map(p => p.name));
    for (const n of NAMES) {
        if (!usedNames.has(n)) return n;
    }
    return 'Player' + nextId;
}

function broadcast(data, excludeWs) {
    const msg = JSON.stringify(data);
    for (const p of players.values()) {
        if (p.ws !== excludeWs && p.ws.readyState === 1) {
            p.ws.send(msg);
        }
    }
}

function sendTo(ws, data) {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(data));
    }
}

wss.on('connection', (ws) => {
    if (players.size >= MAX_PLAYERS) {
        sendTo(ws, { t: 'full' });
        ws.close();
        return;
    }

    const id = nextId++;
    const color = pickColor();
    const name = pickName();
    usedColors.add(color);

    const player = { ws, id, name, color };
    players.set(id, player);

    // Send welcome with player list
    const playerList = [];
    for (const [pid, p] of players) {
        if (pid !== id) {
            playerList.push({ id: pid, name: p.name, color: p.color });
        }
    }
    sendTo(ws, { t: 'welcome', id, name, color, players: playerList });

    // Notify others
    broadcast({ t: 'joined', id, name, color }, ws);

    console.log(`Player ${name} (${id}) joined. Total: ${players.size}`);

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            // Handle name update from client
            if (data.t === 'name') {
                const newName = (data.name || '').trim().slice(0, 12);
                if (newName) {
                    player.name = newName;
                    broadcast({ t: 'rename', id, name: newName }, ws);
                    console.log(`Player ${id} renamed to ${newName}`);
                }
                return;
            }
            data.id = id; // stamp sender
            broadcast(data, ws);
        } catch (e) {
            // ignore malformed messages
        }
    });

    ws.on('close', () => {
        players.delete(id);
        usedColors.delete(color);
        broadcast({ t: 'left', id });
        console.log(`Player ${name} (${id}) left. Total: ${players.size}`);
    });

    ws.on('error', () => {
        // handled by close
    });
});

console.log(`Snowball Fight server running on ws://localhost:${PORT}`);
