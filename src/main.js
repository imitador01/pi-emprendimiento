const state = {
  items: new Map(),
  slot: "10:20–10:40",
  products: [],
  orderResult: null,
};

const screens = {
  menu: document.querySelector("#screen-menu"),
  summary: document.querySelector("#screen-summary"),
  confirmed: document.querySelector("#screen-confirmed"),
};

const money = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

function total() {
  return [...state.items.values()].reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
}

function itemCount() {
  return [...state.items.values()].reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
}

function setError(elementId, message) {
  const element = document.getElementById(elementId);

  if (!element) {
    return;
  }

  if (!message) {
    element.textContent = "";
    element.hidden = true;
    return;
  }

  element.textContent = message;
  element.hidden = false;
}

function updateQuantity(productId, delta) {
  const product = state.products.find((item) => item.id === productId);

  if (!product) {
    return;
  }

  const current = state.items.get(productId) || {
    id: productId,
    name: product.name,
    price: Number(product.price),
    quantity: 0,
  };

  current.quantity = Math.max(0, current.quantity + delta);

  if (current.quantity === 0) {
    state.items.delete(productId);
  } else {
    state.items.set(productId, current);
  }

  renderCart();

  if (screens.summary.classList.contains("active")) {
    renderSummary();
  }
}

function renderMenu() {
  const featured = document.querySelector("#featured-products");
  const list = document.querySelector("#menu-list");

  if (!state.products.length) {
    return;
  }

  featured.innerHTML = state.products
    .slice(0, 3)
    .map(
      (product) => `
        <article class="product-card">
          <div class="food-image"><span></span><b></b></div>
          <small>${product.name}</small>
          <strong>${money(product.price)}</strong>
          <button class="add-wide" type="button" data-product-id="${product.id}" data-price="${product.price}">
            +
          </button>
        </article>
      `,
    )
    .join("");

  list.innerHTML = state.products
    .slice(3)
    .map(
      (product) => `
        <article class="list-card" data-row="${product.id}">
          <div class="thumb"><span></span></div>

          <div class="product-info">
            <small>${product.name}</small>
            <strong>${money(product.price)}</strong>
          </div>

          <div class="quantity">
            <button data-action="minus" type="button" data-product-id="${product.id}">−</button>
            <span>0</span>
            <button class="plus" data-action="plus" type="button" data-product-id="${product.id}" data-price="${product.price}">+</button>
          </div>

          <label>Cantidad</label>
        </article>
      `,
    )
    .join("");

  bindProductControls();
  renderCart();
}

function bindProductControls() {
  document.querySelectorAll(".add-wide").forEach((button) => {
    button.addEventListener("click", () => {
      updateQuantity(Number(button.dataset.productId), 1);
    });
  });

  document.querySelectorAll('[data-action="plus"]').forEach((button) => {
    button.addEventListener("click", () => {
      updateQuantity(Number(button.dataset.productId), 1);
    });
  });

  document.querySelectorAll('[data-action="minus"]').forEach((button) => {
    button.addEventListener("click", () => {
      const productId = Number(button.dataset.productId);
      const current = state.items.get(productId);

      if (!current || current.quantity <= 0) {
        return;
      }

      updateQuantity(productId, -1);
    });
  });
}

function renderCart() {
  const count = itemCount();

  document.querySelector("#product-count").textContent =
    `${count} producto${count === 1 ? "" : "s"}`;

  document.querySelector("#subtotal").textContent = money(total());

  document.querySelectorAll("[data-row]").forEach((row) => {
    const productId = Number(row.dataset.row);
    const quantity = state.items.get(productId)?.quantity || 0;
    row.querySelector(".quantity span").textContent = quantity;
  });
}

function renderSummary() {
  const container = document.querySelector("#order-lines");

  if (!state.items.size) {
    container.innerHTML = '<p class="empty-order">Selecciona al menos un producto para continuar.</p>';
    document.querySelector("#summary-total").textContent = `${money(total())} COP`;
    return;
  }

  container.innerHTML = [...state.items.values()]
    .map(
      (item) => `
        <div class="order-line">
          <div>
            <em>${item.quantity}×</em>
            <span>${item.name}</span>
          </div>

          <strong>
            ${money(item.price * item.quantity)} COP
          </strong>
        </div>
      `,
    )
    .join("");

  document.querySelector("#summary-total").textContent =
    `${money(total())} COP`;
}

function showScreen(name) {
  Object.values(screens).forEach((screen) => {
    screen.classList.remove("active");
  });

  screens[name].classList.add("active");

  const steps = {
    menu: ["Paso 1 de 3 · Menú", 0],
    summary: ["Paso 2 de 3 · Recogida", 1],
    confirmed: ["Paso 3 de 3 · Confirmado", 2],
  };

  document.querySelector("#step-label").textContent = steps[name][0];

  document.querySelectorAll("#step-dots i").forEach((dot, index) => {
    dot.classList.toggle("active", index === steps[name][1]);
  });
}

function syncPickupSelection(slotText = state.slot) {
  state.slot = slotText;

  document.querySelectorAll(".slots button").forEach((button) => {
    const slot = button.dataset.slot;
    const isSelected = slot === slotText;

    button.classList.toggle("selected", isSelected);
    button.innerHTML = isSelected ? `✓&nbsp;&nbsp;${slot}` : slot;
  });
}

function configureDefaultState() {
  const initialSlot = document.querySelector(".slots button.selected")?.dataset.slot || state.slot;
  syncPickupSelection(initialSlot);
  renderCart();
}

function renderConfirmation(order) {
  const number = document.querySelector("#confirmation-number");
  const pickup = document.querySelector("#confirmation-pickup");
  const code = document.querySelector("#confirmation-code");
  const total = document.querySelector("#confirmation-total");
  const button = document.querySelector("#open-whatsapp");
  const status = document.querySelector("#whatsapp-status");

  number.textContent = order.orderCode.replace("PED-", "").replace(/-/g, "");
  pickup.textContent = order.pickupTime;
  code.textContent = order.orderCode;
  total.textContent = `${money(order.totalPrice)} COP`;
  button.hidden = true;
  status.hidden = true;
  button.dataset.whatsappUrl = order.whatsappUrl;
}

function attemptWhatsApp(url) {
  const button = document.querySelector("#open-whatsapp");
  const status = document.querySelector("#whatsapp-status");

  const popup = window.open(url, "_blank", "noopener,noreferrer");

  if (popup) {
    popup.opener = null;
    button.hidden = true;
    status.hidden = true;
    return;
  }

  button.hidden = false;
  button.dataset.whatsappUrl = url;
  status.hidden = false;
}

async function loadProducts() {
  const fallbackProducts = [
    { id: 1, name: "Hamburguesa", price: 3500 },
    { id: 2, name: "Jugo natural", price: 2800 },
    { id: 3, name: "Empanada de queso", price: 2200 },
    { id: 4, name: "Café americano", price: 2500 },
    { id: 5, name: "Sandwich de pollo", price: 5200 },
    { id: 6, name: "Té helado", price: 1800 },
    { id: 7, name: "Brownie", price: 3000 },
    { id: 8, name: "Almuerzo universitario", price: 6500 },
  ];

  try {
    const response = await fetch("/api/products");
    const payload = await response.json();

    if (response.ok && Array.isArray(payload.products) && payload.products.length) {
      state.products = payload.products.map((product) => ({
        ...product,
        price: Number(product.price),
      }));
      renderMenu();
      return;
    }

    throw new Error("No products available");
  } catch (error) {
    state.products = fallbackProducts;
    renderMenu();
  }
}

async function submitOrder() {
  const name = document.querySelector("#customer-name").value.trim();
  const phone = "";

  if (!name) {
    setError("summary-error", "El nombre es obligatorio.");
    return;
  }

  if (!state.items.size) {
    setError("summary-error", "Debes agregar al menos un producto.");
    return;
  }

  if (!state.slot) {
    setError("summary-error", "Debes seleccionar un horario de recogida.");
    return;
  }

  setError("summary-error", "");

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        phone,
        pickupTime: state.slot,
        items: [...state.items.values()].map((item) => ({
          productId: item.id,
          quantity: item.quantity,
        })),
      }),
    });

    const payload = await response.json();

    if (!response.ok || !payload.success) {
      setError("summary-error", payload.message || "No se pudo confirmar el pedido.");
      return;
    }

    state.orderResult = payload.order;
    renderConfirmation(payload.order);
    showScreen("confirmed");
    attemptWhatsApp(payload.order.whatsappUrl);
  } catch (error) {
    setError("summary-error", "Ocurrió un error al guardar el pedido. Intenta nuevamente.");
  }
}

document
  .querySelector("#go-summary")
  .addEventListener("click", () => {
    const name = document.querySelector("#customer-name").value.trim();

    if (!name) {
      setError("menu-error", "El nombre es obligatorio.");
      return;
    }

    if (!state.items.size) {
      setError("menu-error", "Debes agregar al menos un producto.");
      return;
    }

    setError("menu-error", "");
    renderSummary();
    showScreen("summary");
  });

document
  .querySelector("#back-menu")
  .addEventListener("click", () => {
    setError("summary-error", "");
    showScreen("menu");
  });

document
  .querySelector("#edit-order")
  .addEventListener("click", () => {
    setError("summary-error", "");
    showScreen("menu");
  });

document
  .querySelector("#confirm-order")
  .addEventListener("click", () => {
    submitOrder();
  });

document
  .querySelector("#restart")
  .addEventListener("click", () => {
    state.items.clear();
    state.orderResult = null;
    document.querySelector("#customer-name").value = "";
    setError("menu-error", "");
    setError("summary-error", "");
    document.querySelector("#open-whatsapp").hidden = true;
    document.querySelector("#whatsapp-status").hidden = true;
    syncPickupSelection("10:20–10:40");
    renderCart();
    showScreen("menu");
  });

document
  .querySelector("#open-whatsapp")
  .addEventListener("click", () => {
    const url = document.querySelector("#open-whatsapp").dataset.whatsappUrl;

    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  });

document.querySelectorAll(".slots button").forEach((button) => {
  button.addEventListener("click", () => {
    syncPickupSelection(button.dataset.slot);
  });
});

configureDefaultState();
loadProducts();
