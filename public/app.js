const state = {
  token: localStorage.getItem("token") || "",
  user: JSON.parse(localStorage.getItem("user") || "null"),
  products: [],
  cart: []
};

const el = {
  productsGrid: document.getElementById("productsGrid"),
  cart: document.getElementById("cart"),
  registerForm: document.getElementById("registerForm"),
  loginForm: document.getElementById("loginForm"),
  checkoutForm: document.getElementById("checkoutForm"),
  productForm: document.getElementById("productForm"),
  sellerPanel: document.getElementById("sellerPanel"),
  sellerOrders: document.getElementById("sellerOrders"),
  adminPanel: document.getElementById("adminPanel"),
  metrics: document.getElementById("metrics"),
  toast: document.getElementById("toast"),
  userBadge: document.getElementById("userBadge"),
  logoutBtn: document.getElementById("logoutBtn"),
  searchInput: document.getElementById("searchInput"),
  categoryFilter: document.getElementById("categoryFilter"),
  reloadProducts: document.getElementById("reloadProducts")
};

// ---------- Toast Notifications ----------
function notify(message, isError = false) {
  el.toast.textContent = message;
  el.toast.style.display = "block";
  el.toast.className = isError ? "warn" : "";
  setTimeout(() => (el.toast.style.display = "none"), 2200);
}

// ---------- API Helper ----------
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ---------- Auth UI ----------
function syncAuthUI() {
  const user = state.user;
  el.userBadge.textContent = user ? `${user.name} (${user.role})` : "Guest";
  el.logoutBtn.hidden = !user;
  el.sellerPanel.hidden = !(user && (user.role === "seller" || user.role === "admin"));
  el.adminPanel.hidden = !(user && user.role === "admin");
}

function saveAuth(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  syncAuthUI();
}

function clearAuth() {
  state.token = "";
  state.user = null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  state.cart = [];
  renderCart();
  syncAuthUI();
}

// ---------- Products ----------
function renderProducts() {
  el.productsGrid.innerHTML = state.products
    .map(
      (p) => `<article class="card">
        <div class="emoji">${p.image || "📦"}</div>
        <h4>${p.name}</h4>
        <div class="price">ETB ${p.price.toLocaleString()}</div>
        <div class="meta">${p.category} • ${p.city}</div>
        <div class="meta">Stock: ${p.stock}</div>
        <button class="buy" data-id="${p.id}">Add to Cart</button>
      </article>`
    )
    .join("");

  // Add to cart buttons
  Array.from(el.productsGrid.querySelectorAll("button.buy")).forEach((button) => {
    button.addEventListener("click", async () => {
      if (!state.user) return notify("Please login first", true);
      try {
        await api("/api/cart/items", { method: "POST", body: JSON.stringify({ productId: button.dataset.id, quantity: 1 }) });
        await loadCart();
        notify("Added to cart");
      } catch (error) {
        notify(error.message, true);
      }
    });
  });
}

async function loadProducts() {
  try {
    const params = new URLSearchParams();
    if (el.searchInput.value) params.set("search", el.searchInput.value);
    if (el.categoryFilter.value) params.set("category", el.categoryFilter.value);
    const data = await api(`/api/products?${params.toString()}`);
    state.products = data.items;
    renderProducts();
  } catch (error) {
    notify(error.message, true);
  }
}

// ---------- Cart ----------
function renderCart() {
  if (!state.user) {
    el.cart.innerHTML = "<p>Login to manage your cart.</p>";
    return;
  }
  if (!state.cart.length) {
    el.cart.innerHTML = "<p>Cart is empty.</p>";
    return;
  }

  el.cart.innerHTML = state.cart
    .map(
      (item) => `<div class="cart-item">
        <span>${item.product.name} x ${item.quantity}</span>
        <button class="ghost" data-remove="${item.productId}">Remove</button>
      </div>`
    )
    .join("");

  Array.from(el.cart.querySelectorAll("button[data-remove]")).forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/api/cart/items/${button.dataset.remove}`, { method: "DELETE" });
        await loadCart();
      } catch (error) {
        notify(error.message, true);
      }
    });
  });
}

async function loadCart() {
  if (!state.user) return;
  try {
    const data = await api("/api/cart");
    state.cart = data.items;
    renderCart();
  } catch (error) {
    notify(error.message, true);
  }
}

// ---------- Seller Orders ----------
async function loadSellerOrders() {
  if (!state.user || (state.user.role !== "seller" && state.user.role !== "admin")) return;
  try {
    const data = await api("/api/seller/orders");
    el.sellerOrders.innerHTML = `<h4>Orders touching your products: ${data.orders.length}</h4>`;
  } catch (error) {
    el.sellerOrders.innerHTML = `<p class='warn'>${error.message}</p>`;
  }
}

// ---------- Admin Metrics ----------
async function loadAdminMetrics() {
  if (!state.user || state.user.role !== "admin") return;
  try {
    const data = await api("/api/admin/metrics");
    el.metrics.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    el.metrics.textContent = error.message;
  }
}

// ---------- Event Listeners ----------
el.registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(el.registerForm);
  try {
    await api("/api/auth/register", { method: "POST", body: JSON.stringify(Object.fromEntries(fd.entries())) });
    notify("Registered successfully. Please login.");
    el.registerForm.reset();
  } catch (error) {
    notify(error.message, true);
  }
});

el.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(el.loginForm);
  try {
    const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(fd.entries())) });
    saveAuth(data.token, data.user);
    notify(`Welcome ${data.user.name}`);
    await loadCart();
    await loadSellerOrders();
    await loadAdminMetrics();
  } catch (error) {
    notify(error.message, true);
  }
});

el.checkoutForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(el.checkoutForm);
  try {
    const data = await api("/api/orders/checkout", { method: "POST", body: JSON.stringify(Object.fromEntries(fd.entries())) });
    notify(`Order ${data.order.id.slice(0, 8)} confirmed`);
    el.checkoutForm.reset();
    await loadCart();
    await loadProducts();
    await loadSellerOrders();
    await loadAdminMetrics();
  } catch (error) {
    notify(error.message, true);
  }
});

el.productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(el.productForm);
  try {
    await api("/api/seller/products", { method: "POST", body: JSON.stringify(Object.fromEntries(fd.entries())) });
    notify("Product created");
    el.productForm.reset();
    await loadProducts();
  } catch (error) {
    notify(error.message, true);
  }
});

el.logoutBtn.addEventListener("click", clearAuth);
el.reloadProducts.addEventListener("click", loadProducts);
el.searchInput.addEventListener("input", loadProducts);
el.categoryFilter.addEventListener("change", loadProducts);

// ---------- Initial Load ----------
syncAuthUI();
loadProducts();
loadCart();
loadSellerOrders();
loadAdminMetrics();
