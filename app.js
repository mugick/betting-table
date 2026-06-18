const STORAGE_KEY = "offline-betting-layout-state";
const DEFAULT_PLAYER_COUNT = 6;
const MAX_PLAYERS = 12;
const MIN_PLAYERS = 1;
const DEALER_INITIAL_SCORE = 20;
const PLAYER_INITIAL_SCORE = 0;
const INITIAL_BET = 1;
const PLAYER_X_MIN = 0.12;
const PLAYER_X_MAX = 0.88;
const PLAYER_Y_MIN = 0.12;
const PLAYER_Y_MAX = 0.86;

const state = {
  nextId: 1,
  dealer: {
    name: "庄家",
    score: DEALER_INITIAL_SCORE
  },
  roundMessage: "准备开始",
  players: []
};

const els = {
  playerCountStat: document.querySelector("#player-count-stat"),
  activeCountStat: document.querySelector("#active-count-stat"),
  totalBetStat: document.querySelector("#total-bet-stat"),
  dealerScoreStat: document.querySelector("#dealer-score-stat"),
  roundStatusText: document.querySelector("#round-status-text"),
  playerCountInput: document.querySelector("#player-count-input"),
  applyCountBtn: document.querySelector("#apply-count-btn"),
  addPlayerBtn: document.querySelector("#add-player-btn"),
  arrangeBtn: document.querySelector("#arrange-btn"),
  clearBetsBtn: document.querySelector("#clear-bets-btn"),
  nextRoundBtn: document.querySelector("#next-round-btn"),
  newMatchBtn: document.querySelector("#new-match-btn"),
  resetLayoutBtn: document.querySelector("#reset-layout-btn"),
  fullscreenBtn: document.querySelector("#fullscreen-btn"),
  bettingBoard: document.querySelector("#betting-board"),
  playersLayer: document.querySelector("#players-layer")
};

const seatColors = [
  "#b54637",
  "#c4903c",
  "#2d7a65",
  "#335f9b",
  "#8d4a88",
  "#8a5b29",
  "#4a7c3d",
  "#bf6b2f"
];

let dragState = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatMoney(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function sanitizeDealer(rawDealer) {
  return {
    name: typeof rawDealer?.name === "string" && rawDealer.name.trim() ? rawDealer.name : "庄家",
    score: Number.isFinite(rawDealer?.score) ? Math.max(0, rawDealer.score) : DEALER_INITIAL_SCORE
  };
}

function sanitizePlayer(rawPlayer, index) {
  const fallbackIndex = index + 1;
  const x = Number.isFinite(rawPlayer?.x) ? clamp(rawPlayer.x, PLAYER_X_MIN, PLAYER_X_MAX) : 0.5;
  const y = Number.isFinite(rawPlayer?.y) ? clamp(rawPlayer.y, PLAYER_Y_MIN, PLAYER_Y_MAX) : 0.5;

  return {
    id: Number.isFinite(rawPlayer?.id) ? rawPlayer.id : fallbackIndex,
    name: typeof rawPlayer?.name === "string" && rawPlayer.name.trim() ? rawPlayer.name : `玩家 ${fallbackIndex}`,
    bet: Number.isFinite(rawPlayer?.bet) ? Math.max(0, rawPlayer.bet) : INITIAL_BET,
    score: Number.isFinite(rawPlayer?.score) ? rawPlayer.score : PLAYER_INITIAL_SCORE,
    x,
    y,
    color: typeof rawPlayer?.color === "string" ? rawPlayer.color : seatColors[index % seatColors.length]
  };
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    createPlayers(DEFAULT_PLAYER_COUNT);
    arrangePlayers();
    persistState();
    return;
  }

  try {
    const saved = JSON.parse(raw);
    state.nextId = Number.isFinite(saved.nextId) ? saved.nextId : 1;
    state.dealer = sanitizeDealer(saved.dealer);
    state.roundMessage = typeof saved.roundMessage === "string" && saved.roundMessage.trim()
      ? saved.roundMessage
      : "准备开始";
    state.players = Array.isArray(saved.players)
      ? saved.players.slice(0, MAX_PLAYERS).map((player, index) => sanitizePlayer(player, index))
      : [];
  } catch {
    state.dealer = sanitizeDealer();
    state.roundMessage = "准备开始";
    state.players = [];
  }

  if (state.players.length === 0) {
    createPlayers(DEFAULT_PLAYER_COUNT);
    arrangePlayers();
    persistState();
  }

  const maxId = state.players.reduce((highest, player) => Math.max(highest, player.id), 0);
  state.nextId = Math.max(state.nextId, maxId + 1);
}

function createPlayer(name = "") {
  const index = state.players.length;
  const player = {
    id: state.nextId,
    name: name || `玩家 ${state.nextId}`,
    bet: INITIAL_BET,
    score: PLAYER_INITIAL_SCORE,
    x: 0.5,
    y: 0.5,
    color: seatColors[index % seatColors.length]
  };
  state.nextId += 1;
  return player;
}

function createPlayers(count) {
  state.players = [];
  state.nextId = 1;
  for (let i = 0; i < count; i += 1) {
    state.players.push(createPlayer(`玩家 ${i + 1}`));
  }
}

function arrangePlayers() {
  const total = state.players.length;
  if (total === 1) {
    state.players[0].x = 0.5;
    state.players[0].y = 0.78;
    return;
  }

  const centerX = 0.5;
  const centerY = 0.5;
  const radiusX = 0.36;
  const radiusY = 0.33;
  const startAngle = -Math.PI / 2;

  state.players.forEach((player, index) => {
    const angle = startAngle + (Math.PI * 2 * index) / total;
    player.x = clamp(centerX + Math.cos(angle) * radiusX, PLAYER_X_MIN, PLAYER_X_MAX);
    player.y = clamp(centerY + Math.sin(angle) * radiusY, PLAYER_Y_MIN, PLAYER_Y_MAX);
  });
}

function setPlayerCount(targetCount) {
  const safeCount = clamp(Math.round(targetCount), MIN_PLAYERS, MAX_PLAYERS);

  if (safeCount > state.players.length) {
    while (state.players.length < safeCount) {
      state.players.push(createPlayer());
    }
  } else if (safeCount < state.players.length) {
    state.players = state.players.slice(0, safeCount);
  }

  arrangePlayers();
  persistState();
  render();
}

function updatePlayer(id, patch) {
  const player = state.players.find((entry) => entry.id === id);
  if (!player) {
    return;
  }

  Object.assign(player, patch);
  persistState();
  renderStats();
  syncSeatDisplay(player.id);
}

function removePlayer(id) {
  if (state.players.length <= MIN_PLAYERS) {
    return;
  }

  state.players = state.players.filter((player) => player.id !== id);
  arrangePlayers();
  persistState();
  render();
}

function clearAllBets() {
  state.players.forEach((player) => {
    player.bet = INITIAL_BET;
  });
  state.roundMessage = "下注已重置为 1。";
  persistState();
  render();
}

function resetLayout() {
  arrangePlayers();
  persistState();
  render();
}

function startNextRound() {
  state.roundMessage = "下一局已开始，所有下注已重置为 1。";
  state.players.forEach((player) => {
    player.bet = INITIAL_BET;
  });
  persistState();
  render();
}

function startNewMatch() {
  state.dealer.score = DEALER_INITIAL_SCORE;
  state.roundMessage = "下一轮已开始，所有玩家得分重置为 0，庄家恢复到 20 分。";
  state.players.forEach((player) => {
    player.bet = INITIAL_BET;
    player.score = PLAYER_INITIAL_SCORE;
  });
  persistState();
  render();
}

function renderStats() {
  const totalPlayers = state.players.length;
  const activePlayers = state.players.filter((player) => player.bet > 0).length;
  const totalBet = state.players.reduce((sum, player) => sum + player.bet, 0);

  els.playerCountStat.textContent = String(totalPlayers);
  els.activeCountStat.textContent = String(activePlayers);
  els.totalBetStat.textContent = formatMoney(totalBet);
  els.dealerScoreStat.textContent = formatMoney(state.dealer.score);
  els.roundStatusText.textContent = state.roundMessage;
  els.playerCountInput.value = String(totalPlayers);
}

function renderPlayers() {
  els.playersLayer.innerHTML = "";

  state.players.forEach((player, index) => {
    const seat = document.createElement("article");
    seat.className = "bet-seat";
    seat.dataset.playerId = String(player.id);
    seat.style.left = `${player.x * 100}%`;
    seat.style.top = `${player.y * 100}%`;

    seat.innerHTML = `
      <div class="seat-handle" data-drag-handle="true">
        <div>
          <div class="seat-tag">
            <span class="seat-dot" style="background:${player.color}"></span>
            <span>座位 ${index + 1}</span>
          </div>
          <div class="seat-subtitle">拖动定位</div>
        </div>
        <button type="button" class="remove-btn" data-remove-player="${player.id}" aria-label="删除玩家">×</button>
      </div>

      <div class="seat-fields">
        <label class="field-group">
          <span class="field-label">玩家名称</span>
          <input
            class="player-name-input"
            data-player-name="${player.id}"
            type="text"
            maxlength="20"
            value="${escapeAttribute(player.name)}"
          >
        </label>

        <label class="field-group">
          <span class="field-label">下注金额</span>
          <input
            class="player-bet-input"
            data-player-bet="${player.id}"
            type="number"
            min="0"
            step="1"
            value="${player.bet}"
          >
        </label>

        <div class="chip-row">
          <button type="button" class="chip-btn" data-chip="${player.id}:1">+1</button>
          <button type="button" class="chip-btn" data-chip="${player.id}:5">+5</button>
          <button type="button" class="chip-btn" data-chip="${player.id}:10">+10</button>
          <button type="button" class="chip-btn clear" data-chip="${player.id}:clear">清空</button>
        </div>

        <div class="result-row">
          <button type="button" class="result-btn lose" data-result="${player.id}:lose">输</button>
          <button type="button" class="result-btn win" data-result="${player.id}:win">赢</button>
          <button type="button" class="result-btn double" data-result="${player.id}:double">赢双倍</button>
        </div>

        <div class="seat-metrics">
          <div class="seat-metric">
            <span>当前下注</span>
            <strong data-bet-total="${player.id}">${formatMoney(player.bet)}</strong>
          </div>
          <div class="seat-metric">
            <span>当前得分</span>
            <strong data-score-total="${player.id}">${formatMoney(player.score)}</strong>
          </div>
        </div>
      </div>
    `;

    els.playersLayer.appendChild(seat);
  });
}

function render() {
  renderStats();
  renderPlayers();
}

function syncSeatDisplay(playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const seat = els.playersLayer.querySelector(`[data-player-id="${playerId}"]`);

  if (!player || !seat) {
    return;
  }

  const betTotal = seat.querySelector(`[data-bet-total="${playerId}"]`);
  const scoreTotal = seat.querySelector(`[data-score-total="${playerId}"]`);

  if (betTotal) {
    betTotal.textContent = formatMoney(player.bet);
  }

  if (scoreTotal) {
    scoreTotal.textContent = formatMoney(player.score);
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(text) {
  return escapeHtml(text).replaceAll('"', "&quot;");
}

function applyChipAction(playerId, action) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    return;
  }

  if (action === "clear") {
    player.bet = 0;
  } else {
    const delta = Number(action);
    if (Number.isFinite(delta)) {
      player.bet = Math.max(0, player.bet + delta);
    }
  }

  persistState();
  render();
}

function applyResultAction(playerId, action) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    return;
  }

  if (state.dealer.score <= 0) {
    state.roundMessage = "庄家分数归 0，本轮游戏结束，请点击“开启下一局”。";
    persistState();
    renderStats();
    return;
  }

  const baseBet = Math.max(0, player.bet);
  if (baseBet <= 0) {
    state.roundMessage = `${player.name} 的下注点数需要大于 0。`;
    persistState();
    renderStats();
    return;
  }

  const targetAmount = action === "double" ? baseBet * 2 : baseBet;

  if (action === "lose") {
    player.score -= targetAmount;
    state.dealer.score += targetAmount;
    state.roundMessage = `庄家从 ${player.name} 收到 ${targetAmount} 分。`;
  } else {
    const actualTransfer = Math.min(state.dealer.score, targetAmount);
    state.dealer.score -= actualTransfer;
    player.score += actualTransfer;
    state.roundMessage = actualTransfer > 0
      ? `庄家输给 ${player.name} ${actualTransfer} 分。`
      : "庄家已经没有可扣分数。";
  }

  if (state.dealer.score <= 0) {
    state.dealer.score = 0;
    state.roundMessage = "庄家分数归 0，本轮游戏结束，请点击“开启下一局”。";
  }

  persistState();
  render();
}

function handleLayerClick(event) {
  const removeTarget = event.target.closest("[data-remove-player]");
  if (removeTarget) {
    removePlayer(Number(removeTarget.dataset.removePlayer));
    return;
  }

  const chipTarget = event.target.closest("[data-chip]");
  if (chipTarget) {
    const [playerIdText, action] = chipTarget.dataset.chip.split(":");
    applyChipAction(Number(playerIdText), action);
    return;
  }

  const resultTarget = event.target.closest("[data-result]");
  if (resultTarget) {
    const [playerIdText, action] = resultTarget.dataset.result.split(":");
    applyResultAction(Number(playerIdText), action);
  }
}

function handleLayerInput(event) {
  const nameInput = event.target.closest("[data-player-name]");
  if (nameInput) {
    updatePlayer(Number(nameInput.dataset.playerName), {
      name: nameInput.value.trim() || "未命名玩家"
    });
    return;
  }

  const betInput = event.target.closest("[data-player-bet]");
  if (betInput) {
    const amount = Number(betInput.value);
    updatePlayer(Number(betInput.dataset.playerBet), {
      bet: Number.isFinite(amount) ? Math.max(0, amount) : 0
    });
  }
}

function updateDraggedPlayer(pointerX, pointerY) {
  if (!dragState) {
    return;
  }

  const boardRect = els.bettingBoard.getBoundingClientRect();
  const centerX = pointerX - boardRect.left - dragState.offsetX;
  const centerY = pointerY - boardRect.top - dragState.offsetY;

  const x = clamp(centerX / boardRect.width, PLAYER_X_MIN, PLAYER_X_MAX);
  const y = clamp(centerY / boardRect.height, PLAYER_Y_MIN, PLAYER_Y_MAX);
  const player = state.players.find((entry) => entry.id === dragState.playerId);

  if (!player) {
    return;
  }

  player.x = x;
  player.y = y;

  dragState.element.style.left = `${x * 100}%`;
  dragState.element.style.top = `${y * 100}%`;
}

function beginDrag(handle, clientX, clientY) {
  const seat = handle.closest(".bet-seat");
  if (!seat) {
    return;
  }

  const playerId = Number(seat.dataset.playerId);
  const seatRect = seat.getBoundingClientRect();
  const boardRect = els.bettingBoard.getBoundingClientRect();
  const seatCenterX = seatRect.left - boardRect.left + seatRect.width / 2;
  const seatCenterY = seatRect.top - boardRect.top + seatRect.height / 2;

  dragState = {
    playerId,
    element: seat,
    offsetX: clientX - boardRect.left - seatCenterX,
    offsetY: clientY - boardRect.top - seatCenterY
  };

  seat.classList.add("dragging");
}

function startDrag(event) {
  const handle = event.target.closest("[data-drag-handle]");
  if (!handle) {
    return;
  }

  if (event.target.closest("button")) {
    return;
  }

  if (event.button !== 0) {
    return;
  }

  beginDrag(handle, event.clientX, event.clientY);
  event.preventDefault();
}

function startTouchDrag(event) {
  const handle = event.target.closest("[data-drag-handle]");
  if (!handle || event.target.closest("button")) {
    return;
  }

  const touch = event.touches[0];
  if (!touch) {
    return;
  }

  beginDrag(handle, touch.clientX, touch.clientY);
  event.preventDefault();
}

function moveDrag(event) {
  if (!dragState) {
    return;
  }

  updateDraggedPlayer(event.clientX, event.clientY);
}

function moveTouchDrag(event) {
  if (!dragState) {
    return;
  }

  const touch = event.touches[0];
  if (!touch) {
    return;
  }

  updateDraggedPlayer(touch.clientX, touch.clientY);
  event.preventDefault();
}

function endDrag() {
  if (!dragState) {
    return;
  }

  dragState.element.classList.remove("dragging");
  persistState();
  dragState = null;
}

function bindEvents() {
  els.applyCountBtn.addEventListener("click", () => {
    setPlayerCount(Number(els.playerCountInput.value) || DEFAULT_PLAYER_COUNT);
  });

  els.addPlayerBtn.addEventListener("click", () => {
    if (state.players.length >= MAX_PLAYERS) {
      return;
    }
    state.players.push(createPlayer());
    arrangePlayers();
    persistState();
    render();
  });

  els.arrangeBtn.addEventListener("click", () => {
    arrangePlayers();
    persistState();
    render();
  });

  els.clearBetsBtn.addEventListener("click", clearAllBets);
  els.nextRoundBtn.addEventListener("click", startNextRound);
  els.newMatchBtn.addEventListener("click", startNewMatch);
  els.resetLayoutBtn.addEventListener("click", resetLayout);
  els.fullscreenBtn.addEventListener("click", async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
      els.fullscreenBtn.textContent = "退出全屏";
      return;
    }

    await document.exitFullscreen?.();
    els.fullscreenBtn.textContent = "进入全屏";
  });

  document.addEventListener("fullscreenchange", () => {
    els.fullscreenBtn.textContent = document.fullscreenElement ? "退出全屏" : "进入全屏";
  });

  els.playersLayer.addEventListener("click", handleLayerClick);
  els.playersLayer.addEventListener("input", handleLayerInput);
  els.playersLayer.addEventListener("mousedown", startDrag);
  els.playersLayer.addEventListener("touchstart", startTouchDrag, { passive: false });
  window.addEventListener("mousemove", moveDrag);
  window.addEventListener("mouseup", endDrag);
  window.addEventListener("touchmove", moveTouchDrag, { passive: false });
  window.addEventListener("touchend", endDrag);
  window.addEventListener("touchcancel", endDrag);
}

loadState();
bindEvents();
render();
