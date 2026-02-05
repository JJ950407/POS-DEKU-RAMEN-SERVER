const state = {
  menu: [],
  activeCategory: "ramen",
  cart: [],
  promo: null,
  wizard: {
    open: false,
    step: 0,
    ramen: null
  }
};

const categoryTitles = {
  ramen: "Ramen",
  extras: "Extras",
  sides: "Acompañamientos",
  drinks: "Bebidas"
};

const categoryButtons = document.querySelectorAll(".category");
const productGrid = document.getElementById("productGrid");
const categoryTitle = document.getElementById("categoryTitle");
const cartItems = document.getElementById("cartItems");
const subtotalEl = document.getElementById("subtotal");
const totalEl = document.getElementById("total");
const orderStatus = document.getElementById("orderStatus");
const promoStatus = document.getElementById("promoStatus");
const promoToggle = document.getElementById("promoToggle");
const orderPrompt = document.getElementById("orderPrompt");
const orderFlowButton = document.getElementById("orderFlowButton");
const orderNextButton = document.getElementById("orderNextButton");
const sendOrderButton = document.getElementById("sendOrder");

const backendInput = document.getElementById("backendInput")
  || document.getElementById("backend")
  || document.getElementById("backendUrl");
const saveBackend = document.getElementById("saveBackend");

const wizardModal = document.getElementById("ramenWizard");
const wizardStep = document.getElementById("wizardStep");
const wizardTitle = document.getElementById("wizardTitle");
const wizardBack = document.getElementById("wizardBack");
const wizardNext = document.getElementById("wizardNext");
const closeWizard = document.getElementById("closeWizard");
const tableSelect = document.getElementById("tableSelect");
const openHistory = document.getElementById("openHistory");
const historyModal = document.getElementById("historyModal");
const closeHistory = document.getElementById("closeHistory");
const historyList = document.getElementById("historyList");
const historyTicket = document.getElementById("historyTicket");
const historyStatus = document.getElementById("historyStatus");
const historyTable = document.getElementById("historyTable");

let historyOrders = [];
let activeHistoryOrderId = null;
let orderFlowStep = 0;

function isLocalhostHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

function normalizeBase(url) {
  try {
    return new URL(url).origin;
  } catch (e) {
    return null;
  }
}

function computeDefaultBackend() {
  return isLocalhostHost(window.location.hostname)
    ? "http://localhost:3000"
    : window.location.origin;
}

function resolveBackendBase() {
  const stored = localStorage.getItem("backendUrl");
  const computed = computeDefaultBackend();
  if (!stored) {
    localStorage.setItem("backendUrl", computed);
    return computed;
  }
  const normalized = normalizeBase(stored);
  if (!normalized) {
    localStorage.setItem("backendUrl", computed);
    return computed;
  }
  if (!isLocalhostHost(window.location.hostname)) {
    const storedHost = new URL(normalized).hostname;
    if (isLocalhostHost(storedHost)) {
      localStorage.setItem("backendUrl", window.location.origin);
      return window.location.origin;
    }
  }
  return normalized;
}

let BACKEND_BASE = resolveBackendBase();
window.DEKU_CONFIG = window.DEKU_CONFIG || {};
window.DEKU_CONFIG.baseUrl = BACKEND_BASE;

function apiUrl(path) {
  return new URL(path, BACKEND_BASE).toString();
}

function apiGet(path) {
  return fetch(apiUrl(path));
}

function assetUrl(path) {
  return new URL(path, BACKEND_BASE).toString();
}

function formatPrice(value) {
  return `$${value.toFixed(0)}`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getMenuByCategory(category) {
  return state.menu.filter((item) => item.category === category);
}

function getProductById(id) {
  return state.menu.find((item) => item.id === id);
}

function setStatus(message) {
  orderStatus.textContent = message;
  setTimeout(() => {
    if (orderStatus.textContent === message) {
      orderStatus.textContent = "";
    }
  }, 3000);
}

function renderCategories() {
  categoryButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.category === state.activeCategory);
  });
  categoryTitle.textContent = categoryTitles[state.activeCategory];
}

function renderProducts() {
  productGrid.innerHTML = "";
  const products = getMenuByCategory(state.activeCategory);

  products.forEach((product) => {
    const card = document.createElement("div");
    card.className = "product-card";

    const image = document.createElement("img");
    image.src = assetUrl(`/assets/menu/${product.image}`);
    image.alt = product.name;

    const name = document.createElement("h3");
    name.textContent = product.name;

    const price = document.createElement("p");
    price.className = "price";
    if (product.prices) {
      price.textContent = `M ${formatPrice(product.prices.M)} / G ${formatPrice(product.prices.G)}`;
    } else {
      price.textContent = formatPrice(product.price || 0);
    }

    card.append(image, name, price);

    if (product.category === "ramen") {
      const button = document.createElement("button");
      button.className = "primary";
      button.textContent = "Configurar";
      button.addEventListener("click", () => openWizard(product));
      card.appendChild(button);
    } else {
      const qtyControl = buildQtyControl(product.id, getCartQty(product.id));
      card.appendChild(qtyControl);
    }

    productGrid.appendChild(card);
  });
}

function buildQtyControl(productId, qty) {
  const wrapper = document.createElement("div");
  wrapper.className = "qty-control";

  const minus = document.createElement("button");
  minus.textContent = "-";
  minus.addEventListener("click", () => adjustCartItem(productId, -1));

  const count = document.createElement("span");
  count.textContent = qty;

  const plus = document.createElement("button");
  plus.textContent = "+";
  plus.addEventListener("click", () => adjustCartItem(productId, 1));

  wrapper.append(minus, count, plus);
  return wrapper;
}

function getCartQty(productId) {
  const item = state.cart.find((entry) => entry.productId === productId && !entry.meta);
  return item ? item.qty : 0;
}

function adjustCartItem(productId, delta) {
  const product = getProductById(productId);
  if (!product) return;

  if (product.category === "extras") {
    const ramenItems = state.cart.filter((entry) => entry.meta);
    if (!ramenItems.length) {
      return setStatus("Agrega un ramen primero.");
    }
    let targetRamen = ramenItems[0];
    if (ramenItems.length > 1) {
      const options = ramenItems.map((entry, index) => `${index + 1}. ${entry.name}`).join("\n");
      const response = prompt(`¿A qué ramen agregar ${product.name}?\n${options}`);
      const selection = Number(response);
      if (!Number.isInteger(selection) || selection < 1 || selection > ramenItems.length) {
        return;
      }
      targetRamen = ramenItems[selection - 1];
    }
    targetRamen.meta.extras = targetRamen.meta.extras || [];
    const existingExtra = targetRamen.meta.extras.find((extra) => extra.productId === product.id);
    let appliedDelta = 0;
    if (existingExtra) {
      existingExtra.qty += delta;
      appliedDelta = delta;
      if (existingExtra.qty <= 0) {
        targetRamen.meta.extras = targetRamen.meta.extras.filter((extra) => extra !== existingExtra);
      }
    } else if (delta > 0) {
      targetRamen.meta.extras.push({
        productId: product.id,
        name: product.name,
        qty: delta,
        unitPrice: product.price
      });
      appliedDelta = delta;
    } else {
      return;
    }
    const adjustment = product.price * appliedDelta;
    const minPrice = typeof targetRamen.basePrice === "number" ? targetRamen.basePrice : 0;
    targetRamen.unitPrice = Math.max(minPrice, targetRamen.unitPrice + adjustment);
    renderCart();
    renderProducts();
    return;
  }

  let item = state.cart.find((entry) => entry.productId === productId && !entry.meta);
  if (!item && delta > 0) {
    item = {
      id: `cart-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      productId: product.id,
      name: product.name,
      qty: 0,
      unitPrice: product.price || 0
    };
    state.cart.push(item);
  }

  if (item) {
    item.qty += delta;
    if (item.qty <= 0) {
      state.cart = state.cart.filter((entry) => entry !== item);
    }
  }

  renderProducts();
  renderCart();
}

function renderCart() {
  cartItems.innerHTML = "";

  if (state.cart.length === 0) {
    cartItems.innerHTML = "<p>No hay items aún.</p>";
  }

  state.cart.forEach((item) => {
    const wrapper = document.createElement("div");
    wrapper.className = "cart-item";

    const header = document.createElement("div");
    header.className = "cart-item-header";

    const title = document.createElement("strong");
    title.textContent = item.name;

    const price = document.createElement("span");
    price.textContent = formatPrice(item.unitPrice * item.qty);

    header.append(title, price);

    if (item.meta) {
      const detail = document.createElement("small");
      detail.textContent = buildRamenDetail(item.meta);

      const removeBtn = document.createElement("button");
      removeBtn.className = "ghost";
      removeBtn.textContent = "Quitar";
      removeBtn.addEventListener("click", () => removeCartItem(item.id));

      wrapper.append(header, detail, removeBtn);
    } else {
      const controls = buildQtyControl(item.productId, item.qty);
      wrapper.append(header, controls);
    }

    cartItems.appendChild(wrapper);
  });

  const totals = calculateTotals();
  subtotalEl.textContent = formatPrice(totals.subtotal);
  totalEl.textContent = formatPrice(totals.total);
}

function renderPromoStatus() {
  if (!promoStatus) return;
  if (!state.promo) {
    promoStatus.textContent = "PROMO 2x1: INACTIVA";
    if (promoToggle) {
      promoToggle.textContent = "Activar override";
    }
    return;
  }
  if (state.promo.promoActive) {
    const label = state.promo.promoSource === "auto_thursday"
      ? "PROMO 2x1: ACTIVA (AUTO JUEVES)"
      : "PROMO 2x1: ACTIVA (OVERRIDE)";
    promoStatus.textContent = label;
  } else {
    promoStatus.textContent = "PROMO 2x1: INACTIVA";
  }
  if (promoToggle) {
    promoToggle.textContent = state.promo.manualOverrideEnabled ? "Desactivar override" : "Activar override";
  }
}

async function fetchPromoStatus() {
  if (!promoStatus) return;
  try {
    const response = await apiGet("/api/promo");
    if (!response.ok) {
      throw new Error("No se pudo cargar promo");
    }
    state.promo = await response.json();
    renderPromoStatus();
  } catch (error) {
    console.error(error);
    promoStatus.textContent = "PROMO 2x1: INACTIVA";
  }
}

async function togglePromoOverride() {
  if (!promoToggle) return;
  const nextEnabled = !(state.promo && state.promo.manualOverrideEnabled);
  try {
    const response = await fetch(apiUrl("/api/promo/override"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: nextEnabled })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message = data && data.error ? data.error : "No se pudo actualizar promo.";
      alert(message);
      return;
    }
    state.promo = await response.json();
    renderPromoStatus();
  } catch (error) {
    console.error(error);
    alert("No se pudo actualizar promo.");
  }
}

function removeCartItem(id) {
  state.cart = state.cart.filter((item) => item.id !== id);
  renderCart();
  renderProducts();
}

function calculateTotals() {
  const subtotal = state.cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  return {
    subtotal,
    total: subtotal
  };
}

function buildRamenDetail(meta) {
  const extras = meta.extras && meta.extras.length
    ? ` | Extras: ${meta.extras.map((extra) => `${extra.name} x${extra.qty}`).join(", ")}`
    : "";
  return `Tamaño ${meta.size} · Picante ${meta.spicy}${extras}`;
}

function openWizard(ramen) {
  state.wizard.open = true;
  state.wizard.step = 0;
  state.wizard.ramen = {
    base: ramen,
    size: null,
    spicy: null,
    extras: {}
  };
  wizardTitle.textContent = ramen.name;
  wizardModal.classList.remove("hidden");
  renderWizardStep();
}

function closeWizardModal() {
  state.wizard.open = false;
  wizardModal.classList.add("hidden");
}

function renderWizardStep() {
  const { ramen, step } = state.wizard;
  wizardStep.innerHTML = "";
  wizardBack.disabled = step === 0;

  if (!ramen) return;

  if (step === 0) {
    wizardStep.innerHTML = `
      <h3>1. Elige tamaño</h3>
      <div class="option-grid">
        ${["M", "G"].map((size) => `
          <div class="option-card ${ramen.size === size ? "selected" : ""}" data-size="${size}">
            <h4>${size === "M" ? "Mediano" : "Grande"}</h4>
            <p class="price">${formatPrice(ramen.base.prices[size])}</p>
          </div>
        `).join("")}
      </div>
    `;
    wizardNext.textContent = "Siguiente";
  }

  if (step === 1) {
    const spicyOptions = getMenuByCategory("spicy");
    wizardStep.innerHTML = `
      <h3>2. Elige picante</h3>
      <div class="option-grid">
        ${spicyOptions.map((option) => `
          <div class="option-card ${ramen.spicy === Number(option.id.split("_")[1]) ? "selected" : ""}" data-spicy="${option.id}">
            <img src="${assetUrl(`/assets/menu/${option.image}`)}" alt="${option.name}" />
            <h4>${option.name}</h4>
          </div>
        `).join("")}
      </div>
    `;
    wizardNext.textContent = "Siguiente";
  }

  if (step === 2) {
    const extras = getMenuByCategory("extras");
    wizardStep.innerHTML = `
      <h3>3. Agrega extras</h3>
      <div class="option-grid">
        ${extras.map((extra) => {
          const qty = ramen.extras[extra.id] || 0;
          return `
            <div class="option-card">
              <img src="${assetUrl(`/assets/menu/${extra.image}`)}" alt="${extra.name}" />
              <h4>${extra.name}</h4>
              <p class="price">${formatPrice(extra.price)}</p>
              <div class="qty-control" data-extra="${extra.id}">
                <button class="extra-minus">-</button>
                <span>${qty}</span>
                <button class="extra-plus">+</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
    wizardNext.textContent = "Siguiente";
  }

  if (step === 3) {
    const extrasList = Object.entries(ramen.extras)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const extra = getProductById(id);
        return `${extra.name} x${qty}`;
      });

    wizardStep.innerHTML = `
      <h3>4. Confirmar ramen</h3>
      <p><strong>Tamaño:</strong> ${ramen.size === "M" ? "Mediano" : "Grande"}</p>
      <p><strong>Picante:</strong> ${ramen.spicy}</p>
      <p><strong>Extras:</strong> ${extrasList.length ? extrasList.join(", ") : "Sin extras"}</p>
    `;
    wizardNext.textContent = "Agregar al carrito";
  }
}

wizardStep.addEventListener("click", (event) => {
  const sizeCard = event.target.closest(".option-card[data-size]");
  const spicyCard = event.target.closest(".option-card[data-spicy]");

  if (sizeCard && state.wizard.step === 0) {
    state.wizard.ramen.size = sizeCard.dataset.size;
    renderWizardStep();
  }

  if (spicyCard && state.wizard.step === 1) {
    const level = Number(spicyCard.dataset.spicy.split("_")[1]);
    state.wizard.ramen.spicy = level;
    renderWizardStep();
  }

  if (state.wizard.step === 2) {
    const extraControl = event.target.closest(".qty-control");
    if (extraControl) {
      const extraId = extraControl.dataset.extra;
      if (event.target.classList.contains("extra-plus")) {
        state.wizard.ramen.extras[extraId] = (state.wizard.ramen.extras[extraId] || 0) + 1;
      }
      if (event.target.classList.contains("extra-minus")) {
        state.wizard.ramen.extras[extraId] = Math.max((state.wizard.ramen.extras[extraId] || 0) - 1, 0);
      }
      renderWizardStep();
    }
  }
});

wizardBack.addEventListener("click", () => {
  if (state.wizard.step > 0) {
    state.wizard.step -= 1;
    renderWizardStep();
  }
});

wizardNext.addEventListener("click", () => {
  const { step, ramen } = state.wizard;

  if (step === 0 && !ramen.size) {
    return setStatus("Selecciona un tamaño.");
  }

  if (step === 1 && !ramen.spicy) {
    return setStatus("Selecciona nivel de picante.");
  }

  if (step < 3) {
    state.wizard.step += 1;
    renderWizardStep();
    return;
  }

  addRamenToCart();
  closeWizardModal();
});

closeWizard.addEventListener("click", closeWizardModal);

function addRamenToCart() {
  const ramen = state.wizard.ramen;
  if (!ramen) return;

  const extras = Object.entries(ramen.extras)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const extra = getProductById(id);
      return {
        productId: extra.id,
        name: extra.name,
        qty,
        unitPrice: extra.price
      };
    });

  const extrasTotal = extras.reduce((sum, extra) => sum + extra.unitPrice * extra.qty, 0);
  const basePrice = ramen.base.prices[ramen.size];

  state.cart.push({
    id: `ramen-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    productId: ramen.base.id,
    name: ramen.base.name,
    qty: 1,
    basePrice,
    unitPrice: basePrice + extrasTotal,
    meta: {
      size: ramen.size,
      spicy: ramen.spicy,
      extras
    }
  });

  renderCart();
}

async function sendOrder() {
  if (orderFlowStep === 0) {
    orderFlowStep = 1;
    state.activeCategory = "sides";
    renderCategories();
    renderProducts();
    updateOrderFlowUI();
    return;
  }
  if (orderFlowStep === 1) {
    orderFlowStep = 2;
    state.activeCategory = "drinks";
    renderCategories();
    renderProducts();
    updateOrderFlowUI();
    return;
  }
  if (!tableSelect || !tableSelect.value) {
    setStatus("Selecciona mesa o Para llevar.");
    return;
  }
  if (state.cart.length === 0) {
    setStatus("Agrega productos antes de enviar.");
    return;
  }
  const totals = calculateTotals();
  const payload = {
    items: state.cart.map((item) => ({
      productId: item.productId,
      name: item.name,
      qty: item.qty,
      basePrice: item.basePrice,
      unitPrice: item.unitPrice,
      meta: item.meta || {}
    })),
    totals,
    table: tableSelect.value
  };

  try {
    const response = await fetch(apiUrl("/api/orders"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error("Error al enviar la orden");
    }

    state.cart = [];
    if (tableSelect) {
      tableSelect.value = "";
    }
    orderFlowStep = 0;
    renderCart();
    renderProducts();
    updateOrderFlowUI();
    setStatus("Orden enviada a cocina.");
  } catch (error) {
    console.error(error);
    setStatus("No se pudo enviar. Revisa conexión.");
  }
}

categoryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.activeCategory = button.dataset.category;
    renderCategories();
    renderProducts();
  });
});

if (saveBackend && backendInput) {
  saveBackend.addEventListener("click", () => {
    const value = backendInput.value.trim();
    if (value) {
      const normalized = normalizeBase(value);
      if (!normalized) {
        return setStatus("URL inválida. Usa http://IP:3000");
      }
      localStorage.setItem("backendUrl", normalized);
      BACKEND_BASE = normalized;
      window.DEKU_CONFIG.baseUrl = normalized;
      backendInput.value = normalized;
      setStatus("URL backend guardada.");
    }
  });
}

if (backendInput) {
  backendInput.value = BACKEND_BASE;
}

function buildTableLabel(value) {
  return value === "PL" ? "Para llevar" : `Mesa ${value}`;
}

function getFilteredHistoryOrders() {
  let filtered = [...historyOrders];
  const statusFilter = historyStatus ? historyStatus.value : "active";
  const tableFilter = historyTable ? historyTable.value : "";
  if (statusFilter === "active") {
    filtered = filtered.filter((order) => ["pending", "preparing", "ready"].includes(order.status));
  } else if (statusFilter !== "all") {
    filtered = filtered.filter((order) => order.status === statusFilter);
  }
  if (tableFilter) {
    filtered = filtered.filter((order) => order.table === tableFilter);
  }
  return filtered;
}

function renderHistoryList(orders) {
  historyList.innerHTML = "";
  historyTicket.innerHTML = "";
  if (!orders.length) {
    historyList.innerHTML = "<p>No hay órdenes.</p>";
    return;
  }
  orders.forEach((order) => {
    const item = document.createElement("div");
    item.className = "cart-item";
    const shortId = order.id.split("-").slice(-1)[0];
    const statusLabel = order.status.toUpperCase();
    item.innerHTML = `
      <div class="cart-item-header">
        <strong>${shortId}</strong>
        <span>${formatPrice(order.totals.total)}</span>
      </div>
      <small>${formatTime(order.createdAt)} · ${buildTableLabel(order.table)} · ${statusLabel}</small>
    `;
    const actions = document.createElement("div");
    if (order.status === "ready") {
      const deliveredBtn = document.createElement("button");
      deliveredBtn.className = "primary";
      deliveredBtn.textContent = "Marcar ENTREGADA";
      deliveredBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        updateHistoryStatus(order.id, "delivered");
      });
      actions.appendChild(deliveredBtn);
    }
    if (order.status === "delivered") {
      const paidBtn = document.createElement("button");
      paidBtn.className = "primary";
      paidBtn.textContent = "Marcar PAGADA";
      paidBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        updateHistoryStatus(order.id, "paid");
      });
      actions.appendChild(paidBtn);
    }
    if (actions.childNodes.length) {
      item.appendChild(actions);
    }
    item.addEventListener("click", () => renderHistoryTicket(order));
    historyList.appendChild(item);
  });
}

function calculateOrderTotal(order) {
  if (order.totals && typeof order.totals.total === "number") {
    return order.totals.total;
  }
  return order.items.reduce((sum, item) => {
    const lineTotal = item.qty * item.unitPrice;
    const extrasTotal = (item.meta && Array.isArray(item.meta.extras))
      ? item.meta.extras.reduce((extraSum, extra) => {
        const extraUnit = typeof extra.unitPrice === "number" ? extra.unitPrice : 0;
        const extraQty = typeof extra.qty === "number" ? extra.qty : 0;
        return extraSum + extraQty * extraUnit;
      }, 0)
      : 0;
    return sum + lineTotal + extrasTotal;
  }, 0);
}

function renderHistoryTicket(order) {
  activeHistoryOrderId = order.id;
  const headerLine = "<div>qty | concepto | unit | importe</div>";
  const lines = order.items.map((item) => {
    const lineTotal = item.qty * item.unitPrice;
    const size = item.meta && item.meta.size ? ` ${item.meta.size}` : "";
    const spicy = item.meta && item.meta.spicy ? ` Picante ${item.meta.spicy}` : "";
    const mainLine = `<div>${item.qty} | ${item.name}${size}${spicy} | ${formatPrice(item.unitPrice)} | ${formatPrice(lineTotal)}</div>`;
    const extrasLines = (item.meta && item.meta.extras && item.meta.extras.length)
      ? item.meta.extras.map((extra) => {
        const extraUnit = typeof extra.unitPrice === "number" ? extra.unitPrice : 0;
        const extraQty = typeof extra.qty === "number" ? extra.qty : 0;
        const extraTotal = extraQty * extraUnit;
        return `<div>${extraQty} | Extra: ${extra.name} | ${formatPrice(extraUnit)} | ${formatPrice(extraTotal)}</div>`;
      }).join("")
      : "";
    return `${mainLine}${extrasLines}`;
  }).join("");

  const total = calculateOrderTotal(order);
  const statusLabel = order.status.toUpperCase();
  const cancelled = order.status === "cancelled";
  const cancelReason = order.cancelReason ? `Motivo: ${order.cancelReason}` : "";
  const promoLine = order.promoApplied ? "<div>PROMO 2x1 JUEVES APLICADA</div>" : "";

  historyTicket.innerHTML = `
    <strong>DEKU RAMEN</strong>
    <div>${buildTableLabel(order.table)} · ${formatTime(order.createdAt)} · ${order.id.split("-").slice(-1)[0]}</div>
    <div>Estado: ${statusLabel}</div>
    ${cancelled ? `<div><strong>CANCELADA</strong></div>` : ""}
    ${cancelled && cancelReason ? `<div>${cancelReason}</div>` : ""}
    <div>${headerLine}</div>
    <div>${lines}</div>
    ${promoLine}
    <div><strong>TOTAL:</strong> ${formatPrice(total)}</div>
  `;

  const actions = document.createElement("div");
  actions.className = "cart-item";

  if (order.status === "ready") {
    const deliveredBtn = document.createElement("button");
    deliveredBtn.className = "primary";
    deliveredBtn.textContent = "Marcar ENTREGADA";
    deliveredBtn.addEventListener("click", () => updateHistoryStatus(order.id, "delivered"));
    actions.appendChild(deliveredBtn);
  }

  if (order.status === "delivered") {
    const paidBtn = document.createElement("button");
    paidBtn.className = "primary";
    paidBtn.textContent = "Marcar PAGADA";
    paidBtn.addEventListener("click", () => updateHistoryStatus(order.id, "paid"));
    actions.appendChild(paidBtn);
  }

  if (order.status !== "paid") {
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "ghost";
    cancelBtn.textContent = "CANCELAR";
    cancelBtn.addEventListener("click", () => cancelHistoryOrder(order.id));
    actions.appendChild(cancelBtn);
  }

  historyTicket.appendChild(actions);
}

async function fetchHistoryOrders() {
  const response = await apiGet("/api/orders");
  historyOrders = await response.json();
}

function refreshHistoryView() {
  const filtered = getFilteredHistoryOrders();
  renderHistoryList(filtered);
  if (activeHistoryOrderId) {
    const current = historyOrders.find((order) => order.id === activeHistoryOrderId);
    if (current) {
      renderHistoryTicket(current);
    }
  }
}

async function updateHistoryStatus(orderId, status, extra = {}) {
  try {
    const response = await fetch(apiUrl(`/api/orders/${orderId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra })
    });
    if (!response.ok) {
      throw new Error("No se pudo actualizar");
    }
    await fetchHistoryOrders();
    refreshHistoryView();
  } catch (error) {
    console.error(error);
    setStatus("No se pudo actualizar la orden.");
  }
}

function cancelHistoryOrder(orderId) {
  const reason = prompt("Motivo de cancelación");
  if (!reason) {
    return;
  }
  updateHistoryStatus(orderId, "cancelled", { cancelReason: reason });
}

async function openHistoryModal() {
  historyModal.classList.remove("hidden");
  try {
    await fetchHistoryOrders();
    refreshHistoryView();
  } catch (error) {
    console.error(error);
    historyList.innerHTML = "<p>No se pudo cargar historial.</p>";
  }
}

function closeHistoryModal() {
  historyModal.classList.add("hidden");
  activeHistoryOrderId = null;
}

if (openHistory) {
  openHistory.addEventListener("click", openHistoryModal);
}

if (closeHistory) {
  closeHistory.addEventListener("click", closeHistoryModal);
}

if (historyStatus) {
  historyStatus.addEventListener("change", refreshHistoryView);
}

if (historyTable) {
  historyTable.addEventListener("change", refreshHistoryView);
}

if (promoToggle) {
  promoToggle.addEventListener("click", togglePromoOverride);
}

function updateOrderFlowUI() {
  if (!sendOrderButton) return;
  if (orderFlowButton) {
    orderFlowButton.style.display = "none";
  }
  if (orderNextButton) {
    orderNextButton.style.display = "none";
  }
  if (orderFlowStep === 0) {
    sendOrderButton.textContent = "ORDENAR";
    if (orderPrompt) {
      orderPrompt.textContent = "";
    }
    return;
  }
  if (orderFlowStep === 1) {
    sendOrderButton.textContent = "ORDENAR";
    if (orderPrompt) {
      orderPrompt.textContent = "¿Desean acompañamientos?";
    }
    return;
  }
  if (orderFlowStep === 2) {
    sendOrderButton.textContent = "ENVIAR A COCINA";
    if (orderPrompt) {
      orderPrompt.textContent = "¿Desean bebidas?";
    }
  }
}

async function init() {
  try {
    const response = await apiGet("/api/menu");
    const data = await response.json();
    state.menu = data.products || [];
    renderCategories();
    renderProducts();
    renderCart();
  } catch (error) {
    console.error(error);
    setStatus("No se pudo cargar menú.");
  }

  fetchPromoStatus();
  updateOrderFlowUI();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((error) => console.error(error));
  }
}

init();

if (sendOrderButton) {
  sendOrderButton.addEventListener("click", sendOrder);
}
