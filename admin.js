const loginView = document.getElementById("loginView");
const dashboardView = document.getElementById("dashboardView");
const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");
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

let menu = null;
let csrfToken = "";
let dirty = false;
let toastTimer = null;

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "İşlem tamamlanamadı.");
    error.status = response.status;
    throw error;
  }
  return payload;
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
  document.getElementById("username").focus();
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
}

function setDirty(value) {
  dirty = value;
  saveButton.disabled = !dirty;
  saveState.textContent = dirty ? "Kaydedilmemiş değişiklik" : "Güncel";
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
    fragment.querySelector(".category-number").textContent = String(categoryIndex + 1).padStart(2, "0");
    fragment.querySelector(".category-heading").textContent = category.name || "Adsız kategori";
    fragment.querySelector(".category-product-count").textContent = `${category.items.length} ürün`;

    const nameInput = fragment.querySelector('[data-field="category-name"]');
    const shortNameInput = fragment.querySelector('[data-field="category-short-name"]');
    nameInput.value = category.name;
    shortNameInput.value = category.shortName;

    fragment.querySelector('[data-action="category-up"]').disabled = categoryIndex === 0;
    fragment.querySelector('[data-action="category-down"]').disabled = categoryIndex === menu.categories.length - 1;

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

  if (action === "category-up" && move(menu.categories, categoryIndex, categoryIndex - 1)) {
    renderEditor();
  } else if (action === "category-down" && move(menu.categories, categoryIndex, categoryIndex + 1)) {
    renderEditor();
  } else if (action === "delete-category") {
    if (!confirm(`“${category.name || "Adsız kategori"}” kategorisi ve içindeki ürünler silinsin mi?`)) return;
    menu.categories.splice(categoryIndex, 1);
    renderEditor();
  } else if (action === "add-item") {
    category.items.push({ name: "Yeni ürün", price: 0, description: "" });
    renderEditor(`[data-category-index="${categoryIndex}"] .item-editor:last-child [data-field="item-name"]`);
  } else if (action === "item-up" && move(category.items, itemIndex, itemIndex - 1)) {
    renderEditor();
  } else if (action === "item-down" && move(category.items, itemIndex, itemIndex + 1)) {
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
  renderEditor('.category-card:last-child [data-field="category-name"]');
  setDirty(true);
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  loginButton.disabled = true;
  loginButton.textContent = "Giriş yapılıyor…";
  try {
    const payload = await request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        username: loginForm.elements.username.value,
        password: loginForm.elements.password.value
      })
    });
    csrfToken = payload.csrfToken;
    loginForm.reset();
    await loadMenu();
    showDashboard();
  } catch (error) {
    loginError.textContent = error.message;
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
    const payload = await request("/api/admin/menu", {
      method: "PUT",
      headers: { "X-CSRF-Token": csrfToken },
      body: JSON.stringify(menu)
    });
    menu = payload.menu;
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
  await request("/api/admin/logout", { method: "POST" }).catch(() => {});
  menu = null;
  csrfToken = "";
  setDirty(false);
  showLogin();
});

async function loadMenu() {
  menu = await request("/api/menu");
  renderEditor();
  setDirty(false);
}

async function initialize() {
  try {
    const session = await request("/api/admin/session");
    csrfToken = session.csrfToken;
    await loadMenu();
    showDashboard();
  } catch {
    showLogin();
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
