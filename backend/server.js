const express = require("express");
const fs = require("fs");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const MENU_PATH = path.join(DATA_DIR, "menu.json");
const ORDERS_PATH = path.join(DATA_DIR, "orders.json");
const PROMO_PATH = path.join(DATA_DIR, "promo.json");
const PROMO_TZ = "America/Mexico_City";
const readyTimers = new Map();

app.use(express.json({ limit: "1mb" }));

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return fallback;
  }
}

function safeWriteJson(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
  }
}

function loadMenu() {
  return safeReadJson(MENU_PATH, { products: [] });
}

function loadOrders() {
  return safeReadJson(ORDERS_PATH, []);
}

function loadPromoState() {
  const fallback = { manualOverrideEnabled: false, updatedAt: null };
  const data = safeReadJson(PROMO_PATH, null);
  if (!data || typeof data.manualOverrideEnabled !== "boolean") {
    safeWriteJson(PROMO_PATH, fallback);
    return fallback;
  }
  return {
    manualOverrideEnabled: data.manualOverrideEnabled,
    updatedAt: data.updatedAt || null
  };
}

function savePromoState(state) {
  safeWriteJson(PROMO_PATH, state);
}

function saveOrders(orders) {
  safeWriteJson(ORDERS_PATH, orders);
}

function normalizeTable(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (value === "Para llevar" || value === "PL") {
    return "PL";
  }
  const number = Number(value);
  if (Number.isInteger(number) && number >= 1 && number <= 10) {
    return String(number);
  }
  return null;
}

function clearReadyTimer(orderId) {
  const existing = readyTimers.get(orderId);
  if (existing) {
    clearTimeout(existing);
    readyTimers.delete(orderId);
  }
}

function scheduleDelivered(orderId) {
  clearReadyTimer(orderId);
  const timer = setTimeout(() => {
    const orders = loadOrders();
    const order = orders.find((item) => item.id === orderId);
    if (!order || order.status !== "ready") {
      return;
    }
    order.status = "delivered";
    saveOrders(orders);
    broadcast("order:updated", order);
  }, 180000);
  readyTimers.set(orderId, timer);
}

function syncReadyTimer(order) {
  if (order.status === "ready") {
    scheduleDelivered(order.id);
    return;
  }
  clearReadyTimer(order.id);
}

function canTransition(from, to) {
  if (to === "cancelled") {
    return from !== "paid";
  }
  if (from === "pending") {
    return to === "preparing";
  }
  if (from === "preparing") {
    return to === "ready";
  }
  if (from === "ready") {
    return to === "delivered";
  }
  if (from === "delivered") {
    return to === "paid";
  }
  if (from === "paid") {
    return false;
  }
  return false;
}

function updateOrderStatus(id, status, meta = {}) {
  const orders = loadOrders();
  const order = orders.find((item) => item.id === id);
  if (!order) {
    return { error: "Orden no encontrada." };
  }
  if (order.status === status) {
    return { order };
  }
  if (!canTransition(order.status, status)) {
    return { error: "Transición inválida." };
  }
  order.status = status;
  if (status === "paid") {
    order.paidAt = new Date().toISOString();
  }
  if (status === "cancelled") {
    order.cancelledAt = new Date().toISOString();
    if (meta.cancelReason) {
      order.cancelReason = meta.cancelReason;
    }
  }
  saveOrders(orders);
  broadcast("order:updated", order);
  syncReadyTimer(order);
  return { order };
}

function broadcast(event, data) {
  const message = JSON.stringify({ event, data });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function generateOrderId() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${Date.now()}-${random}`;
}

function validateOrderPayload(payload) {
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
    return "La orden debe incluir items.";
  }
  if (!payload.totals || typeof payload.totals.total !== "number") {
    return "La orden debe incluir totales válidos.";
  }
  const table = normalizeTable(payload.table);
  if (!table) {
    return "La orden debe incluir mesa válida.";
  }
  return null;
}

function isThursdayNow(now = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: PROMO_TZ, weekday: "short" }).format(now);
  return weekday === "Thu";
}

function buildPromoPayload(promoState, now = new Date()) {
  const isThursday = isThursdayNow(now);
  const manualOverrideEnabled = Boolean(promoState.manualOverrideEnabled);
  const promoActive = isThursday || manualOverrideEnabled;
  const promoSource = promoActive ? (isThursday ? "auto_thursday" : "manual_override") : null;
  return {
    isThursdayNow: isThursday,
    manualOverrideEnabled,
    promoActive,
    promoSource,
    tz: PROMO_TZ,
    nowISO: now.toISOString(),
    promoType: "2x1_jueves"
  };
}

function calculatePromoDiscount(items) {
  const menu = loadMenu();
  const menuById = new Map(menu.products.map((product) => [product.id, product]));
  const ramenUnitPrices = [];
  items.forEach((item) => {
    const product = menuById.get(item.productId);
    if (!product || product.category !== "ramen") {
      return;
    }
    const qty = Number(item.qty);
    const unitPrice = Number(item.unitPrice);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice)) {
      return;
    }
    for (let i = 0; i < qty; i += 1) {
      ramenUnitPrices.push(unitPrice);
    }
  });
  ramenUnitPrices.sort((a, b) => a - b);
  let discount = 0;
  for (let i = 0; i + 1 < ramenUnitPrices.length; i += 2) {
    discount += ramenUnitPrices[i];
  }
  return discount;
}

app.get("/api/menu", (req, res) => {
  const menu = loadMenu();
  res.json(menu);
});

app.get("/api/promo", (req, res) => {
  const promoState = loadPromoState();
  const payload = buildPromoPayload(promoState);
  res.json(payload);
});

app.post("/api/promo/override", (req, res) => {
  const { enabled, confirmText } = req.body || {};
  if (confirmText !== "ACTIVAR PROMO 2X1") {
    return res.status(400).json({ error: "Confirmación inválida. Escribe ACTIVAR PROMO 2X1." });
  }
  const promoState = {
    manualOverrideEnabled: Boolean(enabled),
    updatedAt: new Date().toISOString()
  };
  savePromoState(promoState);
  const payload = buildPromoPayload(promoState);
  res.json(payload);
});

app.get("/api/orders", (req, res) => {
  const { status } = req.query;
  let orders = loadOrders();
  if (status) {
    orders = orders.filter((order) => order.status === status);
  }
  orders.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json(orders);
});

app.post("/api/orders", (req, res) => {
  const error = validateOrderPayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const table = normalizeTable(req.body.table);
  if (!table) {
    return res.status(400).json({ error: "Mesa inválida." });
  }

  const now = new Date();
  const promoState = loadPromoState();
  const promoPayload = buildPromoPayload(promoState, now);
  let promoDiscount = 0;
  if (promoPayload.promoActive) {
    promoDiscount = calculatePromoDiscount(req.body.items);
  }
  if (!Number.isFinite(promoDiscount) || promoDiscount <= 0) {
    promoDiscount = 0;
  }
  const totals = {
    ...req.body.totals,
    total: promoDiscount > 0
      ? Math.max(0, req.body.totals.total - promoDiscount)
      : req.body.totals.total
  };
  const promoApplied = promoDiscount > 0;

  const orders = loadOrders();
  const order = {
    id: generateOrderId(),
    createdAt: now.toISOString(),
    status: "pending",
    table,
    items: req.body.items,
    totals,
    notes: req.body.notes || ""
  };
  order.promoApplied = promoApplied;
  order.promoType = "2x1_jueves";
  order.promoSource = promoPayload.promoActive ? promoPayload.promoSource : null;
  order.promoDiscount = promoDiscount;
  order.promoTimestamp = now.toISOString();
  orders.push(order);
  saveOrders(orders);
  broadcast("order:new", order);
  syncReadyTimer(order);
  res.status(201).json(order);
});

app.patch("/api/orders/:id", (req, res) => {
  const { id } = req.params;
  const { status, cancelReason } = req.body;
  if (!status || !["pending", "preparing", "ready", "delivered", "paid", "cancelled"].includes(status)) {
    return res.status(400).json({ error: "Status inválido." });
  }
  const result = updateOrderStatus(id, status, { cancelReason });
  if (result.error) {
    const code = result.error === "Orden no encontrada." ? 404 : 400;
    return res.status(code).json({ error: result.error });
  }
  res.json(result.order);
});

app.use("/kitchen", express.static(path.join(__dirname, "../kitchen-display")));
app.use("/", express.static(path.join(__dirname, "../waiter-app")));

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ event: "connected", data: "ok" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`POS backend running on http://localhost:${PORT}`);
  loadOrders().forEach((order) => syncReadyTimer(order));
});
