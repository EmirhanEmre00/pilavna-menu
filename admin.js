const loginView = document.getElementById("loginView");
const dashboardView = document.getElementById("dashboardView");
const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");
const passwordInput = document.getElementById("password");
const passwordToggle = document.getElementById("passwordToggle");
const logoutButton = document.getElementById("logoutButton");
const saveButton = document.getElementById("saveButton");
const addCategoryButton = document.getElementById("addCategoryButton");
const editor = document.getElementById("editor");
const categoryTemplate = document.getElementById("categoryTemplate");
const itemTemplate = document.getElementById("itemTemplate");
const categoryCount = document.getElementById("categoryCount");
const itemCount = document.getElementById("itemCount");
const saveState = document.getElementById("saveState");
const toast = document.getElementById("toast");
const supabaseConfig = window.PILAVNA_SUPABASE;
const supabaseUrl = supabaseConfig?.url?.replace(/\/$/, "") || "";
const supabaseKey = supabaseConfig?.publishableKey || "";
const sessionStorageKey = "pilavna_admin_session";
const expandedCategories = new Set();

let menu = null;
let accessToken = "";
let refreshToken = "";
let tokenExpiresAt = 0;
let dirty = false;
let toastTimer = null;

function assertSupabaseConfigured() {
  if (!supabaseUrl || !supabaseKey || !supabaseConfig?.adminEmail || !supabaseConfig?.adminUsername) {
    const error = new Error("Yönetim bağlantısı henüz yapılandırılmamış. Site sahibiyle iletişime geçin.");
    error.code = "SERVICE_UNAVAILABLE";
    throw error;
  }
}

async function request(path, { method = "GET", body, authenticated = false, headers = {} } = {}) {
  assertSupabaseConfigured();
  let response;
  try {
    response = await fetch(`${supabaseUrl}${path}`, {
      method,
      cache: "no-store",
      headers: {
        apikey: supabaseKey,
        Accept: "application/json",
        ...(authenticated && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  } catch {
    const error = new Error("Yönetim servisine ulaşılamıyor. Bağlantınızı kontrol edip tekrar deneyin.");
    error.code = "SERVICE_UNAVAILABLE";
    throw error;
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json().catch(() => ({})) : null;

  if (!response.ok) {
    const error = new Error(payload?.msg || payload?.message || payload?.error_description || "İşlem tamamlanamadı.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function saveSession(payload) {
  accessToken = payload.access_token;
  refreshToken = payload.refresh_token;
  tokenExpiresAt = Date.now() + Number(payload.expires_in || 3600) * 1000;
  sessionStorage.setItem(sessionStorageKey, JSON.stringify({ accessToken, refreshToken, tokenExpiresAt }));
}

function clearSession() {
  accessToken = "";
  refreshToken = "";
  tokenExpiresAt = 0;
  sessionStorage.removeItem(sessionStorageKey);
}

async function refreshSession() {
  if (!refreshToken) return false;
  const payload = await request("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: refreshToken }
  });
  saveSession(payload);
  return true;
}

async function restoreSession() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(sessionStorageKey) || "null");
    if (!stored?.accessToken || !stored?.refreshToken) return false;
    accessToken = stored.accessToken;
    refreshToken = stored.refreshToken;
    tokenExpiresAt = Number(stored.tokenExpiresAt || 0);

    if (tokenExpiresAt <= Date.now() + 30_000) await refreshSession();
    await request("/auth/v1/user", { authenticated: true });
    return true;
  } catch {
    clearSession();
    return false;
  }
}

function setPasswordVisible(visible) {
  passwordInput.type = visible ? "text" : "password";
  passwordToggle.setAttribute("aria-pressed", String(visible));
  passwordToggle.setAttribute("aria-label", visible ? "Parolayı gizle" : "Parolayı göster");
  passwordToggle.querySelector("span").textContent = visible ? "Gizle" : "Göster";
}

function showToast(message, type = "success") {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("error", type === "error");
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function showLogin(message = "") {
  dashboardView.hidden = true;
  loginView.hidden = false;
  loginError.textContent = message;
  loginError.hidden = !message;
  setPasswordVisible(false);
  document.getElementById("username").focus();
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
}

function setDirty(value) {
  dirty = value;
  saveButton.disabled = !dirty;
  saveState.textContent = dirty ? "Kaydedilmedi" : "Güncel";
  saveState.closest("article").classList.toggle("is-dirty", dirty);
}

function updateSummary() {
  categoryCount.textContent = menu.categories.length;
  itemCount.textContent = menu.categories.reduce((total, category) => total + category.items.length, 0);
}

function move(array, from, to) {
  if (to < 0 || to >= array.length) return false;
  const [entry] = array.splice(from, 1);
  array.splice(to, 0, entry);
  return true;
}

function renderEditor(focusSelector = "") {
  editor.replaceChildren();

  menu.categories.forEach((category, categoryIndex) => {
    const fragment = categoryTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".category-card");
    card.dataset.categoryIndex = categoryIndex;
    const categoryExpanded = expandedCategories.has(categoryIndex);
    card.classList.toggle("is-collapsed", !categoryExpanded);
    fragment.querySelector(".category-number").textContent = String(categoryIndex + 1).padStart(2, "0");
    fragment.querySelector(".category-heading").textContent = category.name || "Adsız kategori";
    fragment.querySelector(".category-product-count").textContent = `${category.items.length} ürün`;

    const nameInput = fragment.querySelector('[data-field="category-name"]');
    const shortNameInput = fragment.querySelector('[data-field="category-short-name"]');
    nameInput.value = category.name;
    shortNameInput.value = category.shortName;

    fragment.querySelector('[data-action="category-up"]').disabled = categoryIndex === 0;
    fragment.querySelector('[data-action="category-down"]').disabled = categoryIndex === menu.categories.length - 1;
    const toggleButton = fragment.querySelector('[data-action="toggle-category"]');
    toggleButton.textContent = categoryExpanded ? "−" : "＋";
    toggleButton.setAttribute("aria-expanded", String(categoryExpanded));
    toggleButton.setAttribute("aria-label", categoryExpanded ? "Kategori ayrıntılarını kapat" : "Kategori ayrıntılarını aç");
    toggleButton.title = categoryExpanded ? "Kategori ayrıntılarını kapat" : "Kategori ayrıntılarını aç";

    const itemList = fragment.querySelector(".items-list");
    const emptyProducts = fragment.querySelector(".empty-products");
    emptyProducts.hidden = category.items.length !== 0;

    category.items.forEach((item, itemIndex) => {
      const itemFragment = itemTemplate.content.cloneNode(true);
      const itemEditor = itemFragment.querySelector(".item-editor");
      itemEditor.dataset.itemIndex = itemIndex;
      itemFragment.querySelector(".item-number").textContent = `Ürün ${itemIndex + 1}`;
      itemFragment.querySelector('[data-field="item-name"]').value = item.name;
      itemFragment.querySelector('[data-field="item-price"]').value = item.price;
      itemFragment.querySelector('[data-field="item-description"]').value = item.description || "";
      itemFragment.querySelector('[data-action="item-up"]').disabled = itemIndex === 0;
      itemFragment.querySelector('[data-action="item-down"]').disabled = itemIndex === category.items.length - 1;
      itemList.appendChild(itemFragment);
    });

    editor.appendChild(fragment);
  });

  updateSummary();
  if (focusSelector) requestAnimationFrame(() => editor.querySelector(focusSelector)?.focus());
}

function locateControl(target) {
  const categoryCard = target.closest(".category-card");
  const itemEditor = target.closest(".item-editor");
  return {
    categoryIndex: Number(categoryCard?.dataset.categoryIndex),
    itemIndex: itemEditor ? Number(itemEditor.dataset.itemIndex) : null
  };
}

editor.addEventListener("input", (event) => {
  const field = event.target.dataset.field;
  if (!field) return;
  const { categoryIndex, itemIndex } = locateControl(event.target);
  const category = menu.categories[categoryIndex];

  if (field === "category-name") {
    category.name = event.target.value;
    event.target.closest(".category-card").querySelector(".category-heading").textContent = event.target.value || "Adsız kategori";
  } else if (field === "category-short-name") {
    category.shortName = event.target.value;
  } else if (field === "item-name") {
    category.items[itemIndex].name = event.target.value;
  } else if (field === "item-price") {
    category.items[itemIndex].price = event.target.value;
  } else if (field === "item-description") {
    category.items[itemIndex].description = event.target.value;
  }
  setDirty(true);
});

editor.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { categoryIndex, itemIndex } = locateControl(button);
  const action = button.dataset.action;
  const category = menu.categories[categoryIndex];

  if (action === "toggle-category") {
    if (expandedCategories.has(categoryIndex)) {
      expandedCategories.delete(categoryIndex);
    } else {
      expandedCategories.clear();
      expandedCategories.add(categoryIndex);
    }
    renderEditor();
    return;
  } else if (action === "category-up" && move(menu.categories, categoryIndex, categoryIndex - 1)) {
    expandedCategories.clear();
    expandedCategories.add(categoryIndex - 1);
    renderEditor();
  } else if (action === "category-down" && move(menu.categories, categoryIndex, categoryIndex + 1)) {
    expandedCategories.clear();
    expandedCategories.add(categoryIndex + 1);
    renderEditor();
  } else if (action === "delete-category") {
    if (!confirm(`“${category.name || "Adsız kategori"}” kategorisi ve içindeki ürünler silinsin mi?`)) return;
    menu.categories.splice(categoryIndex, 1);
    expandedCategories.clear();
    renderEditor();
  } else if (action === "add-item") {
    category.items.push({ name: "Yeni ürün", price: 0, description: "" });
    expandedCategories.clear();
    expandedCategories.add(categoryIndex);
    renderEditor(`[data-category-index="${categoryIndex}"] .item-editor:last-child [data-field="item-name"]`);
  } else if (action === "item-up" && move(category.items, itemIndex, itemIndex - 1)) {
    expandedCategories.add(categoryIndex);
    renderEditor();
  } else if (action === "item-down" && move(category.items, itemIndex, itemIndex + 1)) {
    expandedCategories.add(categoryIndex);
    renderEditor();
  } else if (action === "delete-item") {
    const item = category.items[itemIndex];
    if (!confirm(`“${item.name || "Adsız ürün"}” ürünü silinsin mi?`)) return;
    category.items.splice(itemIndex, 1);
    renderEditor();
  } else {
    return;
  }
  setDirty(true);
});

addCategoryButton.addEventListener("click", () => {
  menu.categories.push({ name: "Yeni kategori", shortName: "Yeni kategori", items: [] });
  expandedCategories.clear();
  expandedCategories.add(menu.categories.length - 1);
  renderEditor('.category-card:last-child [data-field="category-name"]');
  setDirty(true);
});

passwordToggle.addEventListener("click", () => {
  const visible = passwordToggle.getAttribute("aria-pressed") !== "true";
  setPasswordVisible(visible);
  passwordInput.focus({ preventScroll: true });
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  loginButton.disabled = true;
  loginButton.textContent = "Giriş yapılıyor…";
  try {
    const enteredUsername = loginForm.elements.username.value.trim();
    if (enteredUsername !== supabaseConfig?.adminUsername) {
      const error = new Error("Kullanıcı adı veya parola hatalı.");
      error.status = 401;
      throw error;
    }

    const payload = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: {
        email: supabaseConfig.adminEmail,
        password: loginForm.elements.password.value
      }
    });
    saveSession(payload);
    loginForm.reset();
    setPasswordVisible(false);
    await loadMenu();
    showDashboard();
  } catch (error) {
    loginError.textContent = [400, 401].includes(error.status)
      ? "Kullanıcı adı veya parola hatalı."
      : error.message;
    loginError.hidden = false;
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Giriş yap";
  }
});

saveButton.addEventListener("click", async () => {
  if (!menu.categories.length) {
    showToast("Menüde en az bir kategori olmalıdır.", "error");
    return;
  }
  const invalidField = editor.querySelector(":invalid");
  if (invalidField) {
    invalidField.reportValidity();
    invalidField.focus();
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Kaydediliyor…";
  try {
    if (tokenExpiresAt <= Date.now() + 30_000) await refreshSession();
    const payload = await request("/rest/v1/menu_content?id=eq.1&select=content", {
      method: "PATCH",
      authenticated: true,
      headers: { Prefer: "return=representation" },
      body: { content: menu }
    });
    if (!payload?.[0]?.content) throw new Error("Menü kaydedilemedi. Yönetici yetkisini kontrol edin.");
    menu = payload[0].content;
    renderEditor();
    setDirty(false);
    showToast("Menü başarıyla güncellendi.");
  } catch (error) {
    if (error.status === 401) {
      showLogin(error.message);
      return;
    }
    showToast(error.message, "error");
    setDirty(true);
  } finally {
    saveButton.textContent = "✓ Değişiklikleri kaydet";
    saveButton.disabled = !dirty;
  }
});

logoutButton.addEventListener("click", async () => {
  if (dirty && !confirm("Kaydedilmemiş değişiklikler var. Yine de çıkış yapılsın mı?")) return;
  await request("/auth/v1/logout", { method: "POST", authenticated: true }).catch(() => {});
  menu = null;
  clearSession();
  setDirty(false);
  showLogin();
});

async function loadMenu() {
  const rows = await request("/rest/v1/menu_content?select=content&id=eq.1", {
    authenticated: Boolean(accessToken)
  });
  if (!rows?.[0]?.content) throw new Error("Menü verisi bulunamadı.");
  menu = rows[0].content;
  renderEditor();
  setDirty(false);
}

async function initialize() {
  try {
    if (await restoreSession()) {
      await loadMenu();
      showDashboard();
      return;
    }
    showLogin();
  } catch (error) {
    showLogin(error.code === "SERVICE_UNAVAILABLE" ? error.message : "");
  }
}

window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && !dashboardView.hidden) {
    event.preventDefault();
    if (!saveButton.disabled) saveButton.click();
  }
});

initialize();
