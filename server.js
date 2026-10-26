"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { randomInt, randomUUID } = require("node:crypto");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const DATA_FILE = path.join(__dirname, "data", "rooms.json");
const MAX_PLAYERS = 12;
const MAX_MESSAGE_BYTES = 16 * 1024;
const rooms = new Map();
const clients = new Map();
const handoverTimers = new Map();

function loadRooms() {
  if (!fs.existsSync(DATA_FILE)) return;
  const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  if (!Array.isArray(saved)) throw new Error("Le fichier data/rooms.json doit contenir une liste.");
  for (const room of saved) {
    if (!/^\d{6}$/.test(room.code) || !Array.isArray(room.players) || !room.game) continue;
    room.players = room.players.map(player => ({ ...player, online: false }));
    room.connections = new Map();
    room.customQuestions = Array.isArray(room.customQuestions) ? room.customQuestions : [];
    room.game.votes = [];
    room.game.history = Array.isArray(room.game.history) ? room.game.history : [];
    room.game.question = room.game.question && room.game.question.targetId ? room.game.question : null;
    rooms.set(room.code, room);
  }
}

function saveRooms() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const serialized = [...rooms.values()].map(({ connections, ...room }) => ({
    ...room,
    players: room.players.map(({ online, ...player }) => player)
  }));
  const temporaryFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(serialized, null, 2), "utf8");
  fs.renameSync(temporaryFile, DATA_FILE);
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function playerFor(room, playerId) {
  return room.players.find(player => player.id === playerId);
}

function cleanName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 24) : "";
}

function nameTaken(room, name, exceptPlayerId = "") {
  const normalized = name.toLocaleLowerCase("fr");
  return room.players.some(player => player.id !== exceptPlayerId && player.name.toLocaleLowerCase("fr") === normalized);
}

function nextGuestName(room) {
  let index = 2;
  let name = `Joueur ${index}`;
  while (nameTaken(room, name)) {
    index += 1;
    name = `Joueur ${index}`;
  }
  return name;
}

function roomSnapshot(room, playerId) {
  const game = { ...room.game };
  delete game.guessTarget;
  delete game.guesses;
  return {
    type: "room",
    room: {
      code: room.code,
      hostId: room.hostId,
      players: room.players.map(({ id, name, online }) => ({ id, name, online, host: id === room.hostId })),
      customQuestions: room.customQuestions,
      game
    },
    playerId
  };
}

function broadcast(room) {
  for (const [playerId, socket] of room.connections) send(socket, roomSnapshot(room, playerId));
}

function persistAndBroadcast(room) {
  saveRooms();
  broadcast(room);
}

function sendError(socket, message) {
  send(socket, { type: "error", message });
}

function makeGame() {
  return {
    started: false,
    ended: false,
    activeIndex: 0,
    turn: 1,
    questionsAsked: 0,
    answersGiven: 0,
    question: null,
    votes: [],
    revealed: false,
    history: [],
    adultUnlocked: false,
    guessTarget: null,
    guessRevealed: false,
    guesses: []
  };
}

function createRoom(name, socket) {
  let code;
  do {
    code = String(randomInt(100000, 1000000));
  } while (rooms.has(code));
  const player = { id: randomUUID(), name: name || "Joueur 1", online: true };
  const room = {
    code,
    hostId: player.id,
    players: [player],
    customQuestions: [],
    game: makeGame(),
    connections: new Map([[player.id, socket]])
  };
  rooms.set(code, room);
  clients.set(socket, { room, playerId: player.id });
  persistAndBroadcast(room);
}

function joinRoom(code, name, reconnectId, socket) {
  const room = rooms.get(code);
  if (!room) return sendError(socket, "Salle introuvable. Vérifiez le code à 6 chiffres.");
  let player = reconnectId ? room.players.find(item => item.id === reconnectId) : null;
  if (player && room.connections.has(player.id)) {
    return sendError(socket, "Ce joueur est déjà connecté à cette salle.");
  }
  if (!player && name) {
    player = room.players.find(item => item.name.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"));
    if (player && room.connections.has(player.id)) {
      return sendError(socket, "Ce nom est déjà connecté à cette salle.");
    }
  }
  if (!player) {
    if (room.players.length >= MAX_PLAYERS) return sendError(socket, `La salle est limitée à ${MAX_PLAYERS} joueurs.`);
    const playerName = name || nextGuestName(room);
    if (nameTaken(room, playerName)) return sendError(socket, "Ce nom est déjà utilisé dans cette salle.");
    player = { id: randomUUID(), name: playerName, online: true };
    room.players.push(player);
  }
  player.online = true;
  cancelHandover(player.id);
  room.connections.set(player.id, socket);
  clients.set(socket, { room, playerId: player.id });
  persistAndBroadcast(room);
}

function cancelHandover(playerId) {
  const timer = handoverTimers.get(playerId);
  if (timer) {
    clearTimeout(timer);
    handoverTimers.delete(playerId);
  }
}

function scheduleHandover(room, playerId) {
  cancelHandover(playerId);
  handoverTimers.set(playerId, setTimeout(() => {
    handoverTimers.delete(playerId);
    if (!room.connections.has(playerId) && room.game.started && !room.game.ended) {
      const activePlayer = room.players[room.game.activeIndex];
      if (activePlayer && activePlayer.id === playerId) {
        changeTurn(room, room.game.activeIndex + 1);
        persistAndBroadcast(room);
      }
    }
  }, 15000));
}

function changeTurn(room, index) {
  const game = room.game;
  const total = room.players.length;
  let nextIndex = ((index % total) + total) % total;
  // La main passe au prochain joueur encore connecté.
  for (let step = 0; step < total; step += 1) {
    const candidate = room.players[(nextIndex + step) % total];
    if (room.connections.has(candidate.id)) {
      game.activeIndex = (nextIndex + step) % total;
      break;
    }
  }
  game.turn += 1;
  game.question = null;
  game.votes = [];
  game.revealed = false;
  game.guessTarget = null;
  game.guessRevealed = false;
  game.guesses = [];
}

function handleMessage(socket, data) {
  if (data.length > MAX_MESSAGE_BYTES) {
    socket.close(1009, "Message trop volumineux");
    return;
  }

  let message;
  try {
    message = JSON.parse(data.toString("utf8"));
  } catch {
    return sendError(socket, "Message réseau illisible.");
  }
  if (!message || typeof message.type !== "string") return sendError(socket, "Commande réseau invalide.");

  if (message.type === "create" || message.type === "join") {
    if (clients.has(socket)) return sendError(socket, "Cette connexion est déjà dans une salle.");
    const name = cleanName(message.name);
    if (message.type === "create") return createRoom(name, socket);
    const code = typeof message.code === "string" ? message.code.trim() : "";
    if (!/^\d{6}$/.test(code)) return sendError(socket, "Le code de salle doit contenir 6 chiffres.");
    const reconnectId = typeof message.playerId === "string" ? message.playerId : "";
    return joinRoom(code, name, reconnectId, socket);
  }

  const context = clients.get(socket);
  if (!context) return sendError(socket, "Créez ou rejoignez une salle d'abord.");
  const { room, playerId } = context;
  const game = room.game;
  const isHost = playerId === room.hostId;
  const isActivePlayer = room.players[game.activeIndex]?.id === playerId;

  switch (message.type) {
    case "rename": {
      const name = cleanName(message.name);
      if (name.length < 1) return sendError(socket, "Choisissez un nom entre 1 et 24 caractères.");
      if (nameTaken(room, name, playerId)) return sendError(socket, "Ce nom est déjà utilisé dans cette salle.");
      const player = playerFor(room, playerId);
      if (!player) return sendError(socket, "Joueur introuvable.");
      player.name = name;
      if (game.question) {
        if (game.question.askerId === playerId) game.question.askerName = name;
        if (game.question.targetId === playerId) game.question.targetName = name;
      }
      game.history.forEach(entry => {
        if (entry.askerId === playerId) entry.asker = name;
        if (entry.targetId === playerId) entry.target = name;
      });
      persistAndBroadcast(room);
      break;
    }
    case "start":
      if (!isHost) return sendError(socket, "Seul l'hôte peut lancer la partie.");
      if (room.players.length < 2) return sendError(socket, "Il faut au moins deux joueurs.");
      if (game.started && !game.ended) return sendError(socket, "La partie est déjà en cours.");
      game.started = true;
      game.ended = false;
      const firstOnline = room.players.findIndex(player => room.connections.has(player.id));
      game.activeIndex = firstOnline >= 0 ? firstOnline : 0;
      game.turn = 1;
      game.questionsAsked = 0;
      game.answersGiven = 0;
      game.history = [];
      game.question = null;
      game.votes = [];
      game.revealed = false;
      game.guessTarget = null;
      game.guessRevealed = false;
      game.guesses = [];
      persistAndBroadcast(room);
      break;
    case "prompt": {
      if (!game.started || game.ended) return sendError(socket, "La partie n'est pas en cours.");
      if (!isActivePlayer) return sendError(socket, "C'est au tour d'un autre joueur de poser les questions.");
      if (game.question) return sendError(socket, "Une question est déjà en cours.");
      const target = playerFor(room, typeof message.targetId === "string" ? message.targetId : "");
      if (!target) return sendError(socket, "Choisissez la personne à qui poser la question.");
      if (target.id === playerId) return sendError(socket, "Vous ne pouvez pas vous interroger vous-même.");
      const mode = typeof message.mode === "string" ? message.mode : "custom";
      const allowedModes = ["truth", "action", "wouldYouRather", "qcm", "adult", "custom"];
      if (!allowedModes.includes(mode)) return sendError(socket, "Type de question inconnu.");
      if (mode === "adult" && !game.adultUnlocked) return sendError(socket, "Le mode 18+ n'est pas déverrouillé.");
      const text = typeof message.text === "string" ? message.text.trim().slice(0, 500) : "";
      const options = Array.isArray(message.options)
        ? message.options.filter(option => typeof option === "string").slice(0, 4).map(option => option.slice(0, 180))
        : [];
      if (!text) return sendError(socket, "La question ne peut pas être vide.");
      if (mode === "wouldYouRather" && options.length !== 2) return sendError(socket, "Il faut exactement deux choix.");
      if (mode === "qcm" && options.length < 2) return sendError(socket, "Cette question doit proposer des choix.");
      const asker = playerFor(room, playerId);
      const historyEntry = {
        id: randomUUID(),
        askerId: playerId,
        asker: asker.name,
        targetId: target.id,
        target: target.name,
        mode,
        text,
        answer: ""
      };
      game.history.push(historyEntry);
      if (game.history.length > 50) game.history.shift();
      game.question = {
        mode,
        text,
        options,
        askerId: playerId,
        askerName: asker.name,
        targetId: target.id,
        targetName: target.name,
        answer: "",
        answerIndex: null,
        answered: false,
        historyId: historyEntry.id
      };
      game.votes = [];
      game.revealed = false;
      game.questionsAsked += 1;
      game.guessTarget = null;
      game.guessRevealed = false;
      game.guesses = [];
      persistAndBroadcast(room);
      break;
    }
    case "answer": {
      if (!game.started || game.ended || !game.question) return sendError(socket, "Aucune question n'est en cours.");
      if (game.question.answered) return sendError(socket, "Cette question a déjà reçu une réponse.");
      if (game.question.targetId !== playerId) return sendError(socket, "Seule la personne interrogée peut répondre.");
      let answer;
      let answerIndex = null;
      if (game.question.options.length) {
        const optionIndex = Number(message.optionIndex);
        if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= game.question.options.length) {
          return sendError(socket, "Choisissez une réponse dans la liste.");
        }
        answerIndex = optionIndex;
        answer = game.question.options[optionIndex];
      } else {
        answer = typeof message.text === "string" ? message.text.trim().slice(0, 500) : "";
        if (!answer) return sendError(socket, "Écrivez votre réponse.");
      }
      game.question.answer = answer;
      game.question.answerIndex = answerIndex;
      game.question.answered = true;
      game.answersGiven += 1;
      const entry = game.history.find(item => item.id === game.question.historyId);
      if (entry) entry.answer = answer;
      persistAndBroadcast(room);
      break;
    }
    case "clearQuestion":
      if (!game.started || game.ended) return sendError(socket, "La partie n'est pas en cours.");
      if (!isActivePlayer) return sendError(socket, "Seul le joueur qui pose les questions peut changer de question.");
      game.question = null;
      persistAndBroadcast(room);
      break;
    case "next":
      if (!game.started || game.ended) return sendError(socket, "La partie n'est pas en cours.");
      if (!isActivePlayer) return sendError(socket, "Seul le joueur qui pose les questions peut passer la main.");
      changeTurn(room, game.activeIndex + 1);
      persistAndBroadcast(room);
      break;
    case "setPlayer":
      if (!isHost) return sendError(socket, "Seul l'hôte peut changer le joueur actif.");
      if (!Number.isInteger(Number(message.index))) return sendError(socket, "Joueur invalide.");
      game.activeIndex = (Number(message.index) + room.players.length) % room.players.length;
      game.turn += 1;
      game.question = null;
      game.votes = [];
      game.revealed = false;
      game.guessTarget = null;
      game.guessRevealed = false;
      game.guesses = [];
      persistAndBroadcast(room);
      break;
    case "adultUnlock":
      if (message.code !== "6969") return sendError(socket, "Code d'accès incorrect.");
      game.adultUnlocked = true;
      persistAndBroadcast(room);
      break;
    case "customQuestion": {
      if (!game.adultUnlocked) return sendError(socket, "Déverrouillez d'abord le mode 18+.");
      const text = typeof message.text === "string" ? message.text.trim().slice(0, 220) : "";
      const category = ["truth", "action", "consequence"].includes(message.category) ? message.category : "";
      if (text.length < 8 || !category) return sendError(socket, "Question ou catégorie invalide.");
      room.customQuestions.push({ text, category });
      persistAndBroadcast(room);
      break;
    }
    case "clearHistory":
      if (!isHost) return sendError(socket, "Seul l'hôte peut vider l'historique.");
      game.history = [];
      persistAndBroadcast(room);
      break;
    case "leave":
      socket.close(1000, "Joueur parti");
      break;
    default:
      sendError(socket, "Commande inconnue.");
  }
}

loadRooms();

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    return response.end(JSON.stringify({ status: "ok" }));
  }
  if (pathname !== "/" && pathname !== "/entre-nous.html") {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return response.end("Introuvable");
  }
  fs.readFile(path.join(__dirname, "entre-nous.html"), (error, html) => {
    if (error) {
      console.error("Impossible de lire entre-nous.html :", error);
      response.writeHead(500);
      return response.end("Impossible de charger le jeu.");
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache"
    });
    response.end(html);
  });
});

const webSocketServer = new WebSocket.Server({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
server.on("upgrade", (request, socket, head) => {
  if (new URL(request.url, `http://${request.headers.host}`).pathname !== "/ws") {
    socket.destroy();
    return;
  }
  webSocketServer.handleUpgrade(request, socket, head, ws => webSocketServer.emit("connection", ws, request));
});

webSocketServer.on("connection", socket => {
  socket.on("message", data => handleMessage(socket, data));
  socket.on("error", error => console.error("Erreur WebSocket :", error.message));
  socket.on("close", () => {
    const context = clients.get(socket);
    if (!context) return;
    clients.delete(socket);
    const { room, playerId } = context;
    if (room.connections.get(playerId) !== socket) return;
    room.connections.delete(playerId);
    const player = playerFor(room, playerId);
    if (player) player.online = false;
    // Si l'hôte quitte la salle, le premier joueur encore connecté prend le relais.
    if (room.hostId === playerId) {
      const nextHost = room.players.find(item => room.connections.has(item.id));
      if (nextHost) room.hostId = nextHost.id;
    }
    scheduleHandover(room, playerId);
    persistAndBroadcast(room);
  });
});

server.listen(PORT, HOST, () => console.log(`Entre Nous écoute sur http://localhost:${PORT}`));

