import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const ADMIN_LOGIN_NAME = "管理员";
const SESSION_STORAGE_KEY = "betting-table-session";
const INITIAL_BET = 0;
const PLAYER_INITIAL_SCORE = 0;
const DEFAULT_DEALER_SCORE = 20;
const MAX_PLAYERS = 12;
const ONLINE_TIMEOUT_MS = 12_000;
const HEARTBEAT_INTERVAL_MS = 4_000;
const AUTO_REFRESH_INTERVAL_MS = 800;
const LOG_FETCH_LIMIT = 300;
const PLAYER_X_MIN = 0.12;
const PLAYER_X_MAX = 0.88;
const PLAYER_Y_MIN = 0.14;
const PLAYER_Y_MAX = 0.86;

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

const state = {
  client: null,
  configReady: false,
  bootstrapMessage: "",
  session: null,
  appState: null,
  players: [],
  logs: [],
  dragState: null,
  pendingResult: null,
  effect: null,
  heartbeatId: null,
  autoRefreshId: null,
  subscriptions: [],
  pendingLayoutTimers: new Map(),
  layoutLockTimers: new Map(),
  layoutLockedPlayerIds: new Set(),
  resultTimerId: null,
  toasts: [],
  pendingDealerChange: null,
  lastTabletMinimal: null
};

const els = {
  setupBanner: document.querySelector("#setup-banner"),
  loginView: document.querySelector("#login-view"),
  adminView: document.querySelector("#admin-view"),
  playerView: document.querySelector("#player-view"),
  adminLoginBtn: document.querySelector("#admin-login-btn"),
  refreshLoginBtn: document.querySelector("#refresh-login-btn"),
  playerLoginList: document.querySelector("#player-login-list"),
  loginPlayerCount: document.querySelector("#login-player-count"),
  loginStatus: document.querySelector("#login-status"),
  setupSection: document.querySelector(".setup-section"),
  setupGrid: document.querySelector(".setup-grid"),
  newPlayerName: document.querySelector("#new-player-name"),
  addPlayerBtn: document.querySelector("#add-player-btn"),
  dealerInitialScoreInput: document.querySelector("#dealer-initial-score-input"),
  saveSettingsBtn: document.querySelector("#save-settings-btn"),
  arrangeBtn: document.querySelector("#arrange-btn"),
  newDayBtn: document.querySelector("#new-day-btn"),
  nextHandBtn: document.querySelector("#next-hand-btn"),
  historyBtn: document.querySelector("#history-btn"),
  newRoundBtn: document.querySelector("#new-round-btn"),
  resetLayoutBtn: document.querySelector("#reset-layout-btn"),
  fullscreenBtn: document.querySelector("#fullscreen-btn"),
  adminLogoutBtn: document.querySelector("#admin-logout-btn"),
  dealerScoreStat: document.querySelector("#dealer-score-stat"),
  dealerPlayerText: document.querySelector("#dealer-player-text"),
  roundStatusText: document.querySelector("#round-status-text"),
  playerCountStat: document.querySelector("#player-count-stat"),
  onlineCountStat: document.querySelector("#online-count-stat"),
  activeCountStat: document.querySelector("#active-count-stat"),
  totalBetStat: document.querySelector("#total-bet-stat"),
  roundHandStat: document.querySelector("#round-hand-stat"),
  bettingBoard: document.querySelector("#betting-board"),
  playersLayer: document.querySelector("#players-layer"),
  adminHistoryCount: document.querySelector("#admin-history-count"),
  adminHistoryList: document.querySelector("#admin-history-list"),
  playerLogoutBtn: document.querySelector("#player-logout-btn"),
  playerNameHeading: document.querySelector("#player-name-heading"),
  playerStatusMessage: document.querySelector("#player-status-message"),
  playerRoundScoreStat: document.querySelector("#player-round-score-stat"),
  playerDayScoreStat: document.querySelector("#player-day-score-stat"),
  playerDealerScoreStat: document.querySelector("#player-dealer-score-stat"),
  playerBetStat: document.querySelector("#player-bet-stat"),
  playerRoundHandStat: document.querySelector("#player-round-hand-stat"),
  playerUpdatedAt: document.querySelector("#player-updated-at"),
  playerBetInput: document.querySelector("#player-bet-input"),
  playerChip1: document.querySelector("#player-chip-1"),
  playerChip5: document.querySelector("#player-chip-5"),
  playerChip10: document.querySelector("#player-chip-10"),
  playerChipClear: document.querySelector("#player-chip-clear"),
  playerBecomeDealerBtn: document.querySelector("#player-become-dealer-btn"),
  playerHistoryCount: document.querySelector("#player-history-count"),
  playerHistoryList: document.querySelector("#player-history-list"),
  resultModal: document.querySelector("#result-modal"),
  modalTitle: document.querySelector("#modal-title"),
  modalDescription: document.querySelector("#modal-description"),
  modalCancelBtn: document.querySelector("#modal-cancel-btn"),
  modalConfirmBtn: document.querySelector("#modal-confirm-btn"),
  historyModal: document.querySelector("#history-modal"),
  historyCloseBtn: document.querySelector("#history-close-btn"),
  dealerModal: document.querySelector("#dealer-modal"),
  dealerModalTitle: document.querySelector("#dealer-modal-title"),
  dealerModalDescription: document.querySelector("#dealer-modal-description"),
  dealerOptionList: document.querySelector("#dealer-option-list"),
  dealerCancelBtn: document.querySelector("#dealer-cancel-btn"),
  dealerConfirmBtn: document.querySelector("#dealer-confirm-btn"),
  toastStack: document.querySelector("#toast-stack")
};

function attachLoginNewDayButton() {
  if (!els.newDayBtn || !els.setupSection) {
    return;
  }

  let actions = els.setupSection.querySelector(".setup-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "setup-actions";
    if (els.setupGrid?.parentNode === els.setupSection) {
      els.setupSection.insertBefore(actions, els.setupGrid.nextSibling);
    } else {
      els.setupSection.appendChild(actions);
    }
  }

  actions.appendChild(els.newDayBtn);
}

attachLoginNewDayButton();

if (els.playerBetStat) {
  els.playerBetStat.closest(".player-stat-card")?.classList.add("hidden");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatMoney(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getSupabaseConfig() {
  return window.SUPABASE_CONFIG || {};
}

function hasValidSupabaseConfig(config) {
  return Boolean(
    config.url &&
      config.anonKey &&
      !String(config.url).includes("YOUR_SUPABASE_URL") &&
      !String(config.anonKey).includes("YOUR_SUPABASE_ANON_KEY")
  );
}

function getBoardBounds() {
  const isAdminVisible = !els.adminView.classList.contains("hidden");
  if (isAdminVisible) {
    return {
      xMin: 0.17,
      xMax: 0.83,
      yMin: 0.12,
      yMax: 0.88
    };
  }

  if (document.body.classList.contains("tablet-minimal")) {
    return {
      xMin: 0.14,
      xMax: 0.86,
      yMin: 0.14,
      yMax: 0.88
    };
  }

  return {
    xMin: PLAYER_X_MIN,
    xMax: PLAYER_X_MAX,
    yMin: PLAYER_Y_MIN,
    yMax: PLAYER_Y_MAX
  };
}

function getPlacementForIndex(index, total) {
  const bounds = getBoardBounds();

  if (total <= 1) {
    return { x: 0.5, y: 0.78 };
  }

  const centerX = 0.5;
  const centerY = 0.5;
  const radiusX = 0.34;
  const radiusY = 0.31;
  const startAngle = -Math.PI / 2;
  const angle = startAngle + (Math.PI * 2 * index) / total;

  return {
    x: clamp(centerX + Math.cos(angle) * radiusX, bounds.xMin, bounds.xMax),
    y: clamp(centerY + Math.sin(angle) * radiusY, bounds.yMin, bounds.yMax)
  };
}

function normalizePlayerPosition(player) {
  const bounds = getBoardBounds();
  return {
    ...player,
    x: clamp(Number(player.x) || 0.5, bounds.xMin, bounds.xMax),
    y: clamp(Number(player.y) || 0.5, bounds.yMin, bounds.yMax),
    rotation: ((Number(player.rotation) || 0) + 360) % 360
  };
}

function getLockedLayoutPlayerIds() {
  const ids = new Set(state.layoutLockedPlayerIds);
  if (state.dragState?.playerId) {
    ids.add(state.dragState.playerId);
  }
  return ids;
}

function lockPlayerLayout(playerId, durationMs = 900) {
  if (!playerId) {
    return;
  }

  const existingTimer = state.layoutLockTimers.get(playerId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  state.layoutLockedPlayerIds.add(playerId);
  const timerId = window.setTimeout(() => {
    state.layoutLockTimers.delete(playerId);
    state.layoutLockedPlayerIds.delete(playerId);
    render();
  }, durationMs);

  state.layoutLockTimers.set(playerId, timerId);
}

function mergePlayersWithLocalLayout(remotePlayers) {
  const localById = new Map(state.players.map((player) => [player.id, player]));
  const lockedIds = getLockedLayoutPlayerIds();

  return remotePlayers.map((player) => {
    const normalized = normalizePlayerPosition(player);
    if (!lockedIds.has(normalized.id)) {
      return normalized;
    }

    const local = localById.get(normalized.id);
    if (!local) {
      return normalized;
    }

    return {
      ...normalized,
      x: local.x,
      y: local.y,
      rotation: local.rotation
    };
  });
}

function shouldDeferBoardSeatRender() {
  return Boolean(state.dragState) || state.layoutLockedPlayerIds.size > 0;
}

function sanitizeAppState(rawState) {
  return {
    id: 1,
    dealer_initial_score: Number(rawState?.dealer_initial_score) || DEFAULT_DEALER_SCORE,
    dealer_score: Number(rawState?.dealer_score) || DEFAULT_DEALER_SCORE,
    dealer_player_id: Number(rawState?.dealer_player_id) || null,
    day_number: Number(rawState?.day_number) || 1,
    round_number: Number(rawState?.round_number) || 1,
    hand_number: Number(rawState?.hand_number) || 1,
    round_message: rawState?.round_message || "准备开始"
  };
}

function getDealerPlayer() {
  const dealerPlayerId = Number(state.appState?.dealer_player_id) || null;
  if (!dealerPlayerId) {
    return null;
  }
  return state.players.find((player) => player.id === dealerPlayerId) || null;
}

function isDealerPlayer(playerId) {
  return Number(playerId) > 0 && Number(state.appState?.dealer_player_id) === Number(playerId);
}

function getCurrentPlayer() {
  if (state.session?.role !== "player") {
    return null;
  }
  return state.players.find((player) => player.id === state.session.playerId) || null;
}

function saveSession() {
  if (!state.session) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state.session));
}

function restoreSession() {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const session = JSON.parse(raw);
    if (session?.role === "admin") {
      state.session = { role: "admin", name: ADMIN_LOGIN_NAME };
      return;
    }

    if (session?.role === "player") {
      const player = state.players.find((entry) => entry.id === session.playerId);
      if (player) {
        state.session = { role: "player", playerId: player.id, name: player.name };
      }
    }
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

function setSession(session) {
  state.session = session;
  saveSession();
  syncHeartbeat();
  render();
}

function logout() {
  const playerId = state.session?.role === "player" ? state.session.playerId : null;
  if (playerId) {
    void setPresenceOffline(playerId);
    sendPresenceOfflineKeepalive(playerId);
  }

  state.session = null;
  saveSession();
  syncHeartbeat();
  render();
}

function isOnline(player) {
  if (!player?.last_seen_at) {
    return false;
  }
  return Date.now() - new Date(player.last_seen_at).getTime() <= ONLINE_TIMEOUT_MS;
}

function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatRelativeTime(value) {
  if (!value) {
    return "未上线";
  }

  const delta = Date.now() - new Date(value).getTime();
  if (delta < 30_000) {
    return "刚刚在线";
  }
  if (delta < 60_000) {
    return "1 分钟内";
  }

  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }

  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function getSignedLogScore(log) {
  const amount = Number(log.transfer_amount) || 0;
  return log.result_type === "lose" ? -amount : amount;
}

function getPlayerDayScore(playerId, dayNumber) {
  return state.logs
    .filter((log) => Number(log.player_id) === playerId && Number(log.day_number ?? 1) === dayNumber)
    .reduce((sum, log) => sum + getSignedLogScore(log), 0);
}

function getPlayerRoundScore(playerId, dayNumber, roundNumber) {
  return state.logs
    .filter(
      (log) =>
        Number(log.player_id) === playerId &&
        Number(log.day_number ?? 1) === dayNumber &&
        Number(log.round_number) === roundNumber
    )
    .reduce((sum, log) => sum + getSignedLogScore(log), 0);
}

function getDealerCandidates(includeCurrentDealer = false) {
  return state.players.filter((player) => {
    if (!isOnline(player)) {
      return false;
    }
    if (includeCurrentDealer) {
      return true;
    }
    return !isDealerPlayer(player.id);
  });
}

function pushToast(message, tone = "info") {
  const id = Date.now() + Math.random();
  state.toasts.push({ id, message, tone });
  renderToasts();
  window.setTimeout(() => {
    state.toasts = state.toasts.filter((toast) => toast.id !== id);
    renderToasts();
  }, 2400);
}

function renderToasts() {
  els.toastStack.innerHTML = state.toasts
    .map(
      (toast) => `
        <article class="toast toast-${toast.tone}">
          ${escapeHtml(toast.message)}
        </article>
      `
    )
    .join("");
}

function setBootstrapMessage(message) {
  state.bootstrapMessage = message;
  els.setupBanner.textContent = message;
  els.setupBanner.classList.toggle("hidden", !message);
}

async function initialize() {
  bindEvents();
  updateResponsiveMode();

  const config = getSupabaseConfig();
  state.configReady = hasValidSupabaseConfig(config);

  if (!state.configReady) {
    setBootstrapMessage("请先填写 supabase-config.js 里的 Supabase 地址和匿名 Key。");
    render();
    return;
  }

  state.client = createClient(config.url, config.anonKey);

  try {
    await ensureAppStateExists();
    await refreshAllData();
    restoreSession();
    syncHeartbeat();
    syncAutoRefresh();
    setupRealtime();
    render();
  } catch (error) {
    console.error(error);
    setBootstrapMessage("无法连接到 Supabase。请先在 Supabase 执行 supabase-setup.sql，再检查配置是否正确。");
    render();
  }
}

async function ensureAppStateExists() {
  const { data, error } = await state.client
    .from("app_state")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error && error.code === "42P01") {
    throw error;
  }

  if (error) {
    throw error;
  }

  if (data) {
    state.appState = sanitizeAppState(data);
    return;
  }

  const { error: insertError } = await state.client.from("app_state").insert({
    id: 1,
    dealer_initial_score: DEFAULT_DEALER_SCORE,
    dealer_score: DEFAULT_DEALER_SCORE,
    day_number: 1,
    round_number: 1,
    hand_number: 1,
    round_message: "准备开始"
  });

  if (insertError) {
    throw insertError;
  }
}

async function refreshAllData() {
  if (!state.client) {
    return;
  }

  const [appRes, playersRes, logsRes] = await Promise.all([
    state.client.from("app_state").select("*").eq("id", 1).single(),
    state.client.from("players").select("*").order("created_at", { ascending: true }),
    state.client.from("settlement_logs").select("*").order("created_at", { ascending: false }).limit(LOG_FETCH_LIMIT)
  ]);

  if (appRes.error) {
    throw appRes.error;
  }
  if (playersRes.error) {
    throw playersRes.error;
  }
  if (logsRes.error) {
    throw logsRes.error;
  }

  state.appState = sanitizeAppState(appRes.data);
  state.players = mergePlayersWithLocalLayout(playersRes.data || []);
  state.logs = logsRes.data || [];

  if (state.session?.role === "player") {
    const player = getCurrentPlayer();
    if (!player) {
      logout();
      pushToast("你的玩家账号已被移除，请重新登录。", "warning");
      return;
    }
    state.session.name = player.name;
  }
}

function setupRealtime() {
  const channel = state.client
    .channel("betting-table-room")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_state" },
      async () => {
        await refreshAndRender();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "players" },
      async () => {
        await refreshAndRender();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "settlement_logs" },
      async () => {
        await refreshAndRender();
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.info("Supabase Realtime subscribed");
      }
    });

  state.subscriptions.push(channel);
}

async function refreshAndRender() {
  try {
    await refreshAllData();
    render();
  } catch (error) {
    console.error(error);
  }
}

async function touchPresence() {
  const player = getCurrentPlayer();
  if (!player || !state.client) {
    return;
  }

  await state.client
    .from("players")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", player.id);
}

async function setPresenceOffline(playerId) {
  if (!playerId || !state.client) {
    return;
  }

  await state.client
    .from("players")
    .update({ last_seen_at: null })
    .eq("id", playerId);
}

function sendPresenceOfflineKeepalive(playerId) {
  if (!playerId) {
    return;
  }

  const config = getSupabaseConfig();
  if (!hasValidSupabaseConfig(config)) {
    return;
  }

  const url = `${config.url}/rest/v1/players?id=eq.${playerId}`;
  void fetch(url, {
    method: "PATCH",
    keepalive: true,
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ last_seen_at: null })
  }).catch(() => {});
}

function syncHeartbeat() {
  if (state.heartbeatId) {
    clearInterval(state.heartbeatId);
    state.heartbeatId = null;
  }

  if (state.session?.role !== "player") {
    return;
  }

  void touchPresence();
  state.heartbeatId = window.setInterval(() => {
    void touchPresence();
  }, HEARTBEAT_INTERVAL_MS);
}

function syncAutoRefresh() {
  if (state.autoRefreshId) {
    clearInterval(state.autoRefreshId);
    state.autoRefreshId = null;
  }

  if (!state.client) {
    return;
  }

  state.autoRefreshId = window.setInterval(() => {
    if (document.hidden) {
      return;
    }

    void refreshAndRender();
  }, AUTO_REFRESH_INTERVAL_MS);
}

function updateResponsiveMode() {
  const isLandscape = window.matchMedia("(orientation: landscape)").matches;
  const isTouchDevice =
    window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  const isCompactLandscape = window.innerWidth <= 1366 && window.innerHeight <= 1024;
  const isTabletMinimal = isLandscape && (isTouchDevice || isCompactLandscape);
  document.body.classList.toggle("tablet-minimal", isTabletMinimal);

  if (state.lastTabletMinimal !== isTabletMinimal) {
    state.players = state.players.map(normalizePlayerPosition);
    state.lastTabletMinimal = isTabletMinimal;
    render();
  }
}

function setActiveView() {
  const role = state.session?.role;

  els.loginView.classList.toggle("hidden", Boolean(role));
  els.adminView.classList.toggle("hidden", role !== "admin");
  els.playerView.classList.toggle("hidden", role !== "player");
}

function renderLogin() {
  els.adminLoginBtn.disabled = !state.configReady;
  els.refreshLoginBtn.disabled = !state.configReady;
  els.addPlayerBtn.disabled = !state.configReady;
  els.saveSettingsBtn.disabled = !state.configReady;
  els.loginPlayerCount.textContent = `${state.players.length} 人`;

  if (document.activeElement !== els.dealerInitialScoreInput) {
    els.dealerInitialScoreInput.value = String(state.appState?.dealer_initial_score ?? DEFAULT_DEALER_SCORE);
  }

  if (!state.configReady) {
    els.playerLoginList.innerHTML = '<p class="empty-state">先完成 Supabase 配置，玩家名单才会显示在这里。</p>';
    els.loginStatus.textContent = "当前还没有连接到 Supabase。";
    return;
  }

  if (state.players.length === 0) {
    els.playerLoginList.innerHTML = '<p class="empty-state">还没有玩家。先用“管理员”身份进入，创建玩家账号。</p>';
  } else {
    els.playerLoginList.innerHTML = state.players
      .map((player) => {
        const online = isOnline(player);
        return `
          <button type="button" class="player-login-chip" data-player-login="${player.id}">
            <span>${escapeHtml(player.name)}</span>
            <small class="${online ? "tone-online" : "tone-offline"}">${online ? "在线" : "离线"}</small>
          </button>
        `;
      })
      .join("");
  }

  els.loginStatus.textContent = state.bootstrapMessage || "管理员点击“管理员”进入，玩家点击自己的名字登录。";
}

function renderAdminStats() {
  const dealerScore = state.appState?.dealer_score ?? DEFAULT_DEALER_SCORE;
  const dealerPlayer = getDealerPlayer();
  const totalPlayers = state.players.length;
  const onlinePlayers = state.players.filter(isOnline);
  const activePlayers = onlinePlayers.filter((player) => !isDealerPlayer(player.id));
  const onlineCount = onlinePlayers.length;
  const activeCount = activePlayers.filter((player) => Number(player.bet) > 0).length;
  const totalBet = activePlayers.reduce((sum, player) => sum + (Number(player.bet) || 0), 0);
  const dayNumber = state.appState?.day_number ?? 1;
  const roundNumber = state.appState?.round_number ?? 1;
  const handNumber = state.appState?.hand_number ?? 1;

  els.dealerScoreStat.textContent = formatMoney(dealerScore);
  els.dealerPlayerText.textContent = dealerPlayer ? `当前庄家：${dealerPlayer.name}` : "当前未指定庄家";
  els.roundStatusText.textContent = state.appState?.round_message || "准备开始";
  els.playerCountStat.textContent = String(totalPlayers);
  els.onlineCountStat.textContent = String(onlineCount);
  els.activeCountStat.textContent = String(activeCount);
  els.totalBetStat.textContent = formatMoney(totalBet);
  els.roundHandStat.textContent = `${dayNumber} / ${roundNumber} / ${handNumber}`;
}

function renderAdminPlayers() {
  const effect = state.effect;
  const onlinePlayers = state.players.filter((player) => isOnline(player) && !isDealerPlayer(player.id));

  els.playersLayer.innerHTML = onlinePlayers
    .map((player, index) => {
      const online = isOnline(player);
      const effectClass =
        effect?.playerId === player.id
          ? `seat-effect seat-effect-${effect.action}`
          : "";

      return `
        <article
          class="bet-seat ${effectClass}"
          data-player-id="${player.id}"
          style="left:${player.x * 100}%; top:${player.y * 100}%; transform: translate(-50%, -50%) rotate(${player.rotation}deg);"
        >
          <div class="seat-handle" data-drag-handle="true">
            <div>
              <div class="seat-tag">
                <span class="seat-dot" style="background:${player.color}"></span>
                <span>位 ${index + 1} · ${escapeHtml(player.name)}</span>
              </div>
              <div class="seat-subtitle">
                ${online ? "在线" : "离线"} · ${formatRelativeTime(player.last_seen_at)} · ${Math.round(player.rotation)}°
              </div>
            </div>
            <button type="button" class="remove-btn" data-remove-player="${player.id}" aria-label="删除玩家">×</button>
          </div>

          <div class="seat-fields">
            <div class="seat-meta-grid">
              <div class="seat-meta-item">
                <span>得分</span>
                <strong>${formatMoney(player.score)}</strong>
              </div>
              <div class="seat-meta-item">
                <span>下注</span>
                <strong>${formatMoney(player.bet)}</strong>
              </div>
            </div>

            <div class="result-row">
              <button type="button" class="result-btn lose" data-result="${player.id}:lose">输</button>
              <button type="button" class="result-btn win" data-result="${player.id}:win">赢</button>
              <button type="button" class="result-btn double" data-result="${player.id}:double">赢双倍</button>
            </div>

            <label class="field-group field-group-range">
              <span class="field-label">旋转角度</span>
              <div class="range-wrap">
                <input
                  type="range"
                  min="0"
                  max="359"
                  value="${Math.round(player.rotation)}"
                  data-player-rotation="${player.id}"
                >
                <strong data-rotation-value="${player.id}">${Math.round(player.rotation)}°</strong>
              </div>
            </label>
          </div>
        </article>
      `;
    })
    .join("");
}

function formatResultLabel(action) {
  if (action === "dealer_collect") {
    return "鎺ュ簞鍏ヨ处";
  }
  if (action === "lose") {
    return "输给庄家";
  }
  if (action === "double") {
    return "赢双倍";
  }
  return "赢庄家";
}

function formatLogSummary(log) {
  if (log.result_type === "dealer_collect") {
    return `${formatResultLabel(log.result_type)} 路 姹囨€讳笂杞簞瀹?${formatMoney(log.transfer_amount)}`;
  }

  return `${formatResultLabel(log.result_type)} 路 涓嬫敞 ${formatMoney(log.bet_amount)} 路 鍙樺寲 ${formatMoney(log.transfer_amount)}`;
}

function renderHistoryItems(logs) {
  if (!logs.length) {
    return '<p class="empty-state">还没有结算记录。</p>';
  }

  return logs
    .map((log) => {
      const currentDealer = getDealerPlayer();
      const dealerName = log.dealer_name || (log.result_type === "dealer_collect" ? log.player_name : currentDealer?.name) || "未记录";
      const toneClass =
        log.result_type === "lose"
          ? "log-loss"
          : log.result_type === "dealer_collect"
            ? "log-dealer"
          : log.result_type === "double"
            ? "log-double"
            : "log-win";

      return `
        <article class="history-item ${toneClass}">
          <div class="history-row history-row-top">
            <strong>${escapeHtml(log.player_name || "玩家")}</strong>
            <span>${formatDateTime(log.created_at)}</span>
          </div>
          <div class="history-row history-row-compact">
            <span>第 ${Number(log.day_number ?? 1)} 天 · 第 ${log.round_number} 轮 · 第 ${log.hand_number} 局</span>
            <span>庄家：${escapeHtml(dealerName || "未记录")}</span>
          </div>
          <div class="history-row history-row-compact history-row-strong">
            <span>${formatLogSummary(log)}</span>
            <span>玩家 ${formatMoney(log.player_score_after)} · 庄 ${formatMoney(log.dealer_score_after)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAdminHistory() {
  els.adminHistoryCount.textContent = `${state.logs.length} 条`;
  els.adminHistoryList.innerHTML = renderHistoryItems(state.logs);
}

function renderAdmin() {
  renderAdminStats();
  if (!shouldDeferBoardSeatRender()) {
    renderAdminPlayers();
  }
  renderAdminHistory();

  const dealerEffectClass = state.effect ? `dealer-effect dealer-effect-${state.effect.action}` : "";
  els.dealerScoreStat.closest(".dealer-panel").className = `dealer-panel ${dealerEffectClass}`.trim();
}

function renderPlayer() {
  const player = getCurrentPlayer();
  if (!player) {
    return;
  }

  const dealerPlayer = getDealerPlayer();
  const currentDealer = isDealerPlayer(player.id);
  const dayNumber = state.appState?.day_number ?? 1;
  const roundNumber = state.appState?.round_number ?? 1;
  const playerLogs = state.logs.filter(
    (log) => Number(log.player_id) === player.id || log.player_name === player.name
  );
  const roundScore = getPlayerRoundScore(player.id, dayNumber, roundNumber);
  const dayScore = getPlayerDayScore(player.id, dayNumber);

  els.playerNameHeading.textContent = player.name;
  els.playerStatusMessage.textContent = state.appState?.round_message || "等待同步";
  if (currentDealer) {
    els.playerStatusMessage.textContent = `你当前是庄家。${state.appState?.round_message || ""}`;
  } else if (dealerPlayer) {
    els.playerStatusMessage.textContent = `${state.appState?.round_message || "等待同步"} 当前庄家：${dealerPlayer.name}`;
  }
  els.playerRoundScoreStat.textContent = formatMoney(roundScore);
  els.playerDayScoreStat.textContent = formatMoney(dayScore);
  els.playerDealerScoreStat.textContent = formatMoney(state.appState?.dealer_score ?? DEFAULT_DEALER_SCORE);
  els.playerBetStat.textContent = formatMoney(player.bet);
  els.playerRoundHandStat.textContent = `${dayNumber} / ${roundNumber} / ${state.appState?.hand_number ?? 1}`;
  els.playerBetInput.value = String(player.bet);
  els.playerBetInput.disabled = currentDealer;
  els.playerChip1.disabled = currentDealer;
  els.playerChip5.disabled = currentDealer;
  els.playerChip10.disabled = currentDealer;
  els.playerChipClear.disabled = currentDealer;
  els.playerBecomeDealerBtn.disabled = currentDealer;
  els.playerBecomeDealerBtn.textContent = currentDealer ? "当前庄家" : "当庄家";
  els.playerUpdatedAt.textContent = `最近更新：${formatDateTime(player.updated_at)}`;
  els.playerHistoryCount.textContent = `${playerLogs.length} 条`;
  els.playerHistoryList.innerHTML = renderHistoryItems(playerLogs);
}

function renderModal() {
  const open = Boolean(state.pendingResult);
  els.resultModal.classList.toggle("hidden", !open);
  els.resultModal.setAttribute("aria-hidden", open ? "false" : "true");

  if (!open) {
    els.modalTitle.textContent = "确认结算";
    els.modalDescription.textContent = "";
    return;
  }

  els.modalTitle.textContent = state.pendingResult.title;
  els.modalDescription.textContent = state.pendingResult.description;
}

function openHistoryModal() {
  els.historyModal.classList.remove("hidden");
  els.historyModal.setAttribute("aria-hidden", "false");
}

function closeHistoryModal() {
  els.historyModal.classList.add("hidden");
  els.historyModal.setAttribute("aria-hidden", "true");
}

function closeDealerModal() {
  state.pendingDealerChange = null;
  renderDealerModal();
}

function render() {
  setActiveView();
  renderLogin();

  if (state.session?.role === "admin") {
    renderAdmin();
  }

  if (state.session?.role === "player") {
    renderPlayer();
  }

  renderModal();
  renderDealerModal();
  renderToasts();
}

async function loginAsAdmin() {
  if (!state.configReady) {
    return;
  }

  setSession({ role: "admin", name: ADMIN_LOGIN_NAME });
  pushToast("已进入管理员总控台。", "success");
}

async function loginAsPlayer(playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    return;
  }

  setSession({ role: "player", playerId: player.id, name: player.name });
  await touchPresence();
  await refreshAndRender();
  pushToast(`已进入 ${player.name} 的下注页。`, "success");
}

async function createPlayerAccount() {
  const rawName = els.newPlayerName.value.trim();

  if (!rawName) {
    pushToast("先输入玩家姓名。", "warning");
    return;
  }

  if (rawName === ADMIN_LOGIN_NAME) {
    pushToast("“管理员”是保留名称，请换一个玩家姓名。", "warning");
    return;
  }

  if (state.players.length >= MAX_PLAYERS) {
    pushToast(`最多支持 ${MAX_PLAYERS} 位玩家。`, "warning");
    return;
  }

  const placement = getPlacementForIndex(state.players.length, state.players.length + 1);
  const color = seatColors[state.players.length % seatColors.length];

  const { error } = await state.client.from("players").insert({
    name: rawName,
    score: PLAYER_INITIAL_SCORE,
    bet: INITIAL_BET,
    x: placement.x,
    y: placement.y,
    rotation: 0,
    color,
    last_seen_at: null
  });

  if (error?.code === "23505") {
    pushToast("这个玩家姓名已经存在了。", "warning");
    return;
  }

  if (error) {
    console.error(error);
    pushToast("添加玩家失败，请稍后再试。", "error");
    return;
  }

  els.newPlayerName.value = "";
  pushToast(`已创建玩家：${rawName}`, "success");
  await refreshAndRender();
}

async function saveDealerInitialScore() {
  const value = clamp(Number(els.dealerInitialScoreInput.value) || DEFAULT_DEALER_SCORE, 1, 99999);
  const { error } = await state.client
    .from("app_state")
    .update({
      dealer_initial_score: value,
      round_message: `庄家初始分已设置为 ${value}。`
    })
    .eq("id", 1);

  if (error) {
    console.error(error);
    pushToast("保存庄家初始分失败。", "error");
    return;
  }

  pushToast(`庄家初始分已保存为 ${value}。`, "success");
}

async function savePlayerBet(playerId, bet) {
  const safeBet = Math.max(0, Math.round(Number(bet) || 0));
  const player = state.players.find((entry) => entry.id === playerId);

  if (isDealerPlayer(playerId)) {
    if (player) {
      els.playerBetInput.value = String(player.bet);
    }
    pushToast("搴勫鏈疆涓嶈兘涓嬫敞銆?", "warning");
    return;
  }

  const previousBet = player ? player.bet : null;
  const optimisticUpdatedAt = new Date().toISOString();

  if (player) {
    player.bet = safeBet;
    player.updated_at = optimisticUpdatedAt;
    render();
  }

  const { error } = await state.client
    .from("players")
    .update({ bet: safeBet, updated_at: optimisticUpdatedAt })
    .eq("id", playerId);

  if (error) {
    console.error(error);
    if (player) {
      player.bet = previousBet;
      render();
    }
    pushToast("保存下注失败。", "error");
    return;
  }

  if (state.session?.role === "player" && state.session.playerId === playerId) {
    await touchPresence();
  }
}

async function removePlayer(playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    return;
  }

  const confirmed = window.confirm(`确认删除玩家“${player.name}”吗？历史流水会保留。`);
  if (!confirmed) {
    return;
  }

  const { error } = await state.client.from("players").delete().eq("id", playerId);
  if (error) {
    console.error(error);
    pushToast("删除玩家失败。", "error");
    return;
  }

  pushToast(`已删除玩家：${player.name}`, "success");
}

async function autoArrangePlayers() {
  const updates = state.players.map((player, index) => {
    const placement = getPlacementForIndex(index, state.players.length);
    return state.client
      .from("players")
      .update({ x: placement.x, y: placement.y })
      .eq("id", player.id);
  });

  const results = await Promise.all(updates);
  const error = results.find((result) => result.error)?.error;
  if (error) {
    console.error(error);
    pushToast("自动排布失败。", "error");
    return;
  }

  pushToast("已自动排布玩家卡片。", "success");
}

async function resetLayout() {
  await autoArrangePlayers();
}

async function startNextHand() {
  const { error } = await state.client.rpc("start_next_hand");
  if (error) {
    console.error(error);
    pushToast(error.message || "开启下一局失败。", "error");
    return;
  }

  pushToast("下一局已开始，所有下注重置为 0。", "success");
}

function startNewDay() {
  openDealerModalForNewDay();
}

async function startNewDayWithDealer(nextDealerPlayerId) {
  const nextDealer = state.players.find((player) => player.id === Number(nextDealerPlayerId));
  if (!nextDealer) {
    pushToast("请先选择今日庄家。", "warning");
    return;
  }

  const { error } = await state.client.rpc("start_next_day");
  if (error) {
    console.error(error);
    pushToast(error.message || "开启今日失败。", "error");
    return;
  }

  const { error: updateError } = await state.client
    .from("app_state")
    .update({
      dealer_player_id: nextDealer.id,
      round_message: `${nextDealer.name} 已成为今日庄家。`
    })
    .eq("id", 1);

  if (updateError) {
    console.error(updateError);
    pushToast(updateError.message || "今日已重置，但设置庄家失败。", "error");
    return;
  }

  pushToast(`${nextDealer.name} 已成为今日庄家。`, "success");
  await refreshAndRender();
}

function queueLayoutSave(playerId, patch) {
  const pending = state.pendingLayoutTimers.get(playerId);
  if (pending) {
    clearTimeout(pending);
  }

  const timerId = window.setTimeout(async () => {
    state.pendingLayoutTimers.delete(playerId);
    const { error } = await state.client.from("players").update(patch).eq("id", playerId);
    if (error) {
      console.error(error);
      pushToast("保存布局失败。", "error");
    }
  }, 180);

  state.pendingLayoutTimers.set(playerId, timerId);
}

function updateDraggedPlayer(pointerX, pointerY) {
  if (!state.dragState) {
    return;
  }

  const boardRect = els.bettingBoard.getBoundingClientRect();
  const bounds = getBoardBounds();
  const centerX = pointerX - boardRect.left - state.dragState.offsetX;
  const centerY = pointerY - boardRect.top - state.dragState.offsetY;
  const x = clamp(centerX / boardRect.width, bounds.xMin, bounds.xMax);
  const y = clamp(centerY / boardRect.height, bounds.yMin, bounds.yMax);
  const player = state.players.find((entry) => entry.id === state.dragState.playerId);

  if (!player) {
    return;
  }

  player.x = x;
  player.y = y;
  state.dragState.element.style.left = `${x * 100}%`;
  state.dragState.element.style.top = `${y * 100}%`;
}

function beginDrag(handle, clientX, clientY) {
  const seat = handle.closest(".bet-seat");
  if (!seat) {
    return;
  }

  const seatRect = seat.getBoundingClientRect();
  const boardRect = els.bettingBoard.getBoundingClientRect();
  const playerId = Number(seat.dataset.playerId);
  const seatCenterX = seatRect.left - boardRect.left + seatRect.width / 2;
  const seatCenterY = seatRect.top - boardRect.top + seatRect.height / 2;

  state.dragState = {
    playerId,
    element: seat,
    offsetX: clientX - boardRect.left - seatCenterX,
    offsetY: clientY - boardRect.top - seatCenterY
  };

  lockPlayerLayout(playerId, 1200);
  seat.classList.add("dragging");
}

function endDrag() {
  if (!state.dragState) {
    return;
  }

  const player = state.players.find((entry) => entry.id === state.dragState.playerId);
  state.dragState.element.classList.remove("dragging");

  if (player) {
    lockPlayerLayout(player.id, 1200);
    queueLayoutSave(player.id, { x: player.x, y: player.y });
  }

  state.dragState = null;
}

function computeSettlementPreview(player, action) {
  const baseBet = Math.max(0, Number(player.bet) || 0);
  const dealerScore = state.appState?.dealer_score ?? 0;
  const target = action === "double" ? baseBet * 2 : baseBet;
  const actual = action === "lose" ? target : Math.min(dealerScore, target);

  if (action === "lose") {
    return {
      title: `确认“${player.name} 输”`,
      description: `${player.name} 会输给庄家 ${formatMoney(actual)} 分。确认后，玩家得分减少，庄家分数增加。`
    };
  }

  if (action === "double") {
    return {
      title: `确认“${player.name} 赢双倍”`,
      description: `${player.name} 将按双倍下注结算，目标为 ${formatMoney(target)} 分，本次实际从庄家转给玩家 ${formatMoney(actual)} 分。`
    };
  }

  return {
    title: `确认“${player.name} 赢”`,
    description: `${player.name} 会从庄家获得 ${formatMoney(actual)} 分。确认后，庄家分数减少，玩家得分增加。`
  };
}

function openResultModal(playerId, action) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    return;
  }

  if ((Number(player.bet) || 0) <= 0) {
    pushToast(`${player.name} 的下注必须大于 0 才能结算。`, "warning");
    return;
  }

  const preview = computeSettlementPreview(player, action);
  state.pendingResult = { playerId, action, ...preview };
  renderModal();
}

function closeResultModal() {
  state.pendingResult = null;
  renderModal();
}

function startSettlementEffect(playerId, action) {
  state.effect = { playerId, action };
  render();

  if (state.resultTimerId) {
    clearTimeout(state.resultTimerId);
  }

  state.resultTimerId = window.setTimeout(() => {
    state.effect = null;
    render();
  }, 1400);
}

async function confirmSettlement() {
  if (!state.pendingResult) {
    return;
  }

  const { playerId, action } = state.pendingResult;
  const player = state.players.find((entry) => entry.id === playerId);
  closeResultModal();

  const { error } = await state.client.rpc("settle_bet", {
    p_player_id: playerId,
    p_result_type: action
  });

  if (error) {
    console.error(error);
    pushToast(error.message || "结算失败。", "error");
    return;
  }

  if (player) {
    startSettlementEffect(player.id, action);
    pushToast(`${player.name} 已结算：${formatResultLabel(action)}`, "success");
  }
}

function handleAdminLayerClick(event) {
  const removeTarget = event.target.closest("[data-remove-player]");
  if (removeTarget) {
    void removePlayer(Number(removeTarget.dataset.removePlayer));
    return;
  }

  const resultTarget = event.target.closest("[data-result]");
  if (resultTarget) {
    const [playerIdText, action] = resultTarget.dataset.result.split(":");
    openResultModal(Number(playerIdText), action);
  }
}

function handleAdminLayerInput(event) {
  const rotationInput = event.target.closest("[data-player-rotation]");
  if (!rotationInput) {
    return;
  }

  const playerId = Number(rotationInput.dataset.playerRotation);
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    return;
  }

  player.rotation = clamp(Number(rotationInput.value) || 0, 0, 359);
  lockPlayerLayout(playerId, 1200);
  const seat = els.playersLayer.querySelector(`[data-player-id="${playerId}"]`);
  const label = els.playersLayer.querySelector(`[data-rotation-value="${playerId}"]`);
  if (seat) {
    seat.style.transform = `translate(-50%, -50%) rotate(${player.rotation}deg)`;
  }
  if (label) {
    label.textContent = `${Math.round(player.rotation)}°`;
  }
  queueLayoutSave(playerId, { rotation: player.rotation });
}

function handleLoginClick(event) {
  const playerTarget = event.target.closest("[data-player-login]");
  if (playerTarget) {
    void loginAsPlayer(Number(playerTarget.dataset.playerLogin));
  }
}

function handlePlayerBetChange() {
  const player = getCurrentPlayer();
  if (!player) {
    return;
  }
  void savePlayerBet(player.id, els.playerBetInput.value);
}

async function handlePlayerChip(delta) {
  const player = getCurrentPlayer();
  if (!player) {
    return;
  }

  const nextBet = delta === "clear"
    ? 0
    : Math.max(0, (Number(player.bet) || 0) + Number(delta));

  els.playerBetInput.value = String(nextBet);
  await savePlayerBet(player.id, nextBet);
}

function handleDealerOptionClick(event) {
  const option = event.target.closest("[data-dealer-option]");
  if (!option || !state.pendingDealerChange) {
    return;
  }

  state.pendingDealerChange.selectedPlayerId = Number(option.dataset.dealerOption);
  renderDealerModal();
}

function bindEvents() {
  els.adminLoginBtn.addEventListener("click", () => {
    void loginAsAdmin();
  });

  els.refreshLoginBtn.addEventListener("click", () => {
    void refreshAndRender();
  });

  els.playerLoginList.addEventListener("click", handleLoginClick);
  els.addPlayerBtn.addEventListener("click", () => {
    void createPlayerAccount();
  });

  els.newPlayerName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void createPlayerAccount();
    }
  });

  els.saveSettingsBtn.addEventListener("click", () => {
    void saveDealerInitialScore();
  });

  els.arrangeBtn.addEventListener("click", () => {
    void autoArrangePlayers();
  });

  els.newDayBtn.addEventListener("click", () => {
    void startNewDay();
  });

  els.historyBtn.addEventListener("click", openHistoryModal);

  els.nextHandBtn.addEventListener("click", () => {
    void startNextHand();
  });

  els.newRoundBtn.addEventListener("click", () => {
    openDealerModalForAdmin();
  });

  els.resetLayoutBtn.addEventListener("click", () => {
    void resetLayout();
  });

  els.fullscreenBtn.addEventListener("click", async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
      return;
    }

    await document.exitFullscreen?.();
  });

  document.addEventListener("fullscreenchange", () => {
    els.fullscreenBtn.textContent = document.fullscreenElement ? "退出全屏" : "全屏";
    updateResponsiveMode();
  });

  els.adminLogoutBtn.addEventListener("click", logout);
  els.playerLogoutBtn.addEventListener("click", logout);

  els.playersLayer.addEventListener("click", handleAdminLayerClick);
  els.playersLayer.addEventListener("input", handleAdminLayerInput);

  els.playersLayer.addEventListener("mousedown", (event) => {
    const handle = event.target.closest("[data-drag-handle]");
    if (!handle || event.target.closest("button,input")) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    beginDrag(handle, event.clientX, event.clientY);
    event.preventDefault();
  });

  els.playersLayer.addEventListener("touchstart", (event) => {
    const handle = event.target.closest("[data-drag-handle]");
    if (!handle || event.target.closest("button,input")) {
      return;
    }
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    beginDrag(handle, touch.clientX, touch.clientY);
    event.preventDefault();
  }, { passive: false });

  window.addEventListener("mousemove", (event) => {
    updateDraggedPlayer(event.clientX, event.clientY);
  });

  window.addEventListener("touchmove", (event) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    updateDraggedPlayer(touch.clientX, touch.clientY);
    if (state.dragState) {
      event.preventDefault();
    }
  }, { passive: false });

  window.addEventListener("mouseup", endDrag);
  window.addEventListener("touchend", endDrag);
  window.addEventListener("touchcancel", endDrag);

  els.playerBetInput.addEventListener("change", handlePlayerBetChange);
  els.playerChip1.addEventListener("click", () => {
    void handlePlayerChip(1);
  });
  els.playerChip5.addEventListener("click", () => {
    void handlePlayerChip(5);
  });
  els.playerChip10.addEventListener("click", () => {
    void handlePlayerChip(10);
  });
  els.playerChipClear.addEventListener("click", () => {
    void handlePlayerChip("clear");
  });
  els.playerBecomeDealerBtn.addEventListener("click", () => {
    const player = getCurrentPlayer();
    if (!player) {
      return;
    }
    openDealerModalForPlayer(player.id);
  });

  els.modalCancelBtn.addEventListener("click", closeResultModal);
  els.modalConfirmBtn.addEventListener("click", () => {
    void confirmSettlement();
  });
  els.historyCloseBtn.addEventListener("click", closeHistoryModal);
  els.dealerCancelBtn.addEventListener("click", closeDealerModal);
  els.dealerConfirmBtn.addEventListener("click", () => {
    void confirmDealerChange();
  });
  els.dealerOptionList.addEventListener("click", handleDealerOptionClick);
  els.resultModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-modal]")) {
      closeResultModal();
    }
  });
  els.historyModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-history-modal]")) {
      closeHistoryModal();
    }
  });
  els.dealerModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-dealer-modal]")) {
      closeDealerModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeResultModal();
      closeHistoryModal();
      closeDealerModal();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void touchPresence();
      return;
    }

    if (state.session?.role === "player") {
      void setPresenceOffline(state.session.playerId);
      sendPresenceOfflineKeepalive(state.session.playerId);
    }
  });

  window.addEventListener("pagehide", () => {
    if (state.session?.role === "player") {
      sendPresenceOfflineKeepalive(state.session.playerId);
    }
  });

  window.addEventListener("resize", updateResponsiveMode);
}

// Clean dealer-rotation UI helpers.
function renderDealerModal() {
  const open = Boolean(state.pendingDealerChange);
  els.dealerModal.classList.toggle("hidden", !open);
  els.dealerModal.setAttribute("aria-hidden", open ? "false" : "true");

  if (!open) {
    els.dealerModalTitle.textContent = "选择下一轮庄家";
    els.dealerModalDescription.textContent = "";
    els.dealerOptionList.innerHTML = "";
    els.dealerConfirmBtn.textContent = "确认并开始下一轮";
    els.dealerConfirmBtn.disabled = true;
    return;
  }

  const candidates = (state.pendingDealerChange.candidateIds || [])
    .map((playerId) => state.players.find((player) => player.id === playerId))
    .filter(Boolean);

  if (state.pendingDealerChange.source === "player") {
    els.dealerModalTitle.textContent = "确认由我当庄家";
    els.dealerModalDescription.textContent = "确认后会自动开启下一轮。上一位庄家的最终庄分会结算到上一位庄家的本轮和今日得分里。";
    els.dealerConfirmBtn.textContent = "确认并开始下一轮";
  } else if (state.pendingDealerChange.source === "new-day") {
    els.dealerModalTitle.textContent = "选择今日庄家";
    els.dealerModalDescription.textContent = "请选择开启今日后的庄家。确认后会重置到新的一天，并把该玩家设为今日庄家。";
    els.dealerConfirmBtn.textContent = "确认并开启今日";
  } else {
    els.dealerModalTitle.textContent = "选择下一轮庄家";
    els.dealerModalDescription.textContent = "请选择下一轮的庄家。确认后会自动开启下一轮，并结算上一位庄家的最终庄分。";
    els.dealerConfirmBtn.textContent = "确认并开始下一轮";
  }

  els.dealerOptionList.innerHTML = candidates
    .map((player) => {
      const selected = Number(state.pendingDealerChange.selectedPlayerId) === player.id;
      return `
        <button
          type="button"
          class="dealer-option ${selected ? "selected" : ""}"
          data-dealer-option="${player.id}"
        >
          <strong>${escapeHtml(player.name)}</strong>
          <span>当前得分 ${formatMoney(player.score)}${isOnline(player) ? " · 在线" : ""}</span>
        </button>
      `;
    })
    .join("");

  els.dealerConfirmBtn.disabled = !candidates.length || !state.pendingDealerChange.selectedPlayerId;
}

function openDealerModalForAdmin() {
  const candidates = getDealerCandidates();
  if (!candidates.length) {
    pushToast("当前没有可接庄的在线玩家。", "warning");
    return;
  }

  state.pendingDealerChange = {
    source: "admin",
    candidateIds: candidates.map((player) => player.id),
    selectedPlayerId: candidates[0].id
  };
  renderDealerModal();
}

function openDealerModalForNewDay() {
  const candidates = getDealerCandidates(true);
  if (!candidates.length) {
    pushToast("当前没有可作为今日庄家的在线玩家。", "warning");
    return;
  }

  state.pendingDealerChange = {
    source: "new-day",
    candidateIds: candidates.map((player) => player.id),
    selectedPlayerId: candidates[0].id
  };
  renderDealerModal();
}

function openDealerModalForPlayer(playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    return;
  }

  if (isDealerPlayer(player.id)) {
    pushToast("你当前已经是庄家。", "warning");
    return;
  }

  state.pendingDealerChange = {
    source: "player",
    candidateIds: [player.id],
    selectedPlayerId: player.id
  };
  renderDealerModal();
}

async function startNextRound(nextDealerPlayerId) {
  const { error } = await state.client.rpc("start_next_round_with_dealer", {
    p_next_dealer_player_id: nextDealerPlayerId
  });
  if (error) {
    console.error(error);
    pushToast(error.message || "开始下一轮失败。", "error");
    return;
  }

  const nextDealer = state.players.find((player) => player.id === Number(nextDealerPlayerId));
  pushToast(nextDealer ? `${nextDealer.name} 已成为下一轮庄家。` : "下一轮已开始。", "success");
}

async function confirmDealerChange() {
  const source = state.pendingDealerChange?.source;
  const nextDealerPlayerId = Number(state.pendingDealerChange?.selectedPlayerId) || null;
  if (!nextDealerPlayerId) {
    pushToast(source === "new-day" ? "请先选择今日庄家。" : "请先选择下一轮庄家。", "warning");
    return;
  }

  closeDealerModal();
  if (source === "new-day") {
    await startNewDayWithDealer(nextDealerPlayerId);
    return;
  }

  await startNextRound(nextDealerPlayerId);
}

void initialize();

