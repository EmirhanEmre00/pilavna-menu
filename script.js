const nav = document.getElementById("categoryNav");
const container = document.getElementById("menuContainer");
const contactSection = document.getElementById("contact");
const menuSummary = document.getElementById("menuSummary");
const priceFormatter = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });

async function fetchMenu() {
  const apiResponse = await fetch("/api/menu", { cache: "no-store" });
  if (apiResponse.ok) return apiResponse.json();

  // Statik önizlemelerde menü görünmeye devam eder; düzenleme için Node sunucusu gerekir.
  const fileResponse = await fetch(`menu.json?v=${Date.now()}`, { cache: "no-store" });
  if (!fileResponse.ok) throw new Error("Menü verisi alınamadı.");
  return fileResponse.json();
}

function createMenuItem(item) {
  const row = document.createElement("div");
  row.className = "menu-row";

  const itemLeft = document.createElement("div");
  itemLeft.className = "item-left";

  const name = document.createElement("h3");
  name.className = "item-name";
  name.textContent = item.name;
  itemLeft.appendChild(name);

  if (item.description) {
    const description = document.createElement("p");
    description.className = "item-desc";
    description.textContent = item.description;
    itemLeft.appendChild(description);
  }

  const price = document.createElement("div");
  price.className = "price";
  price.textContent = `${priceFormatter.format(Number(item.price))}₺`;

  row.append(itemLeft, price);
  return row;
}

function renderMenu(data) {
  if (!data || !Array.isArray(data.categories) || data.categories.length === 0) {
    throw new Error("Menüde gösterilecek kategori bulunamadı.");
  }

  nav.replaceChildren();
  container.replaceChildren();

  data.categories.forEach((category, index) => {
    const sectionId = `category-${index}`;
    const navButton = document.createElement("button");
    navButton.type = "button";
    navButton.className = "category-btn";
    navButton.textContent = category.shortName || category.name;
    navButton.dataset.target = sectionId;
    navButton.addEventListener("click", () => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveButton(sectionId);
    });
    nav.appendChild(navButton);

    const section = document.createElement("section");
    section.className = "category-section";
    section.id = sectionId;

    const header = document.createElement("div");
    header.className = "category-header";
    const title = document.createElement("h2");
    title.className = "category-title";
    title.textContent = category.name;
    const count = document.createElement("span");
    count.className = "category-count";
    count.textContent = `${category.items.length} çeşit`;
    header.append(title, count);

    const list = document.createElement("div");
    list.className = "menu-list";
    category.items.forEach((item) => list.appendChild(createMenuItem(item)));
    section.append(header, list);
    container.appendChild(section);
  });

  const totalItems = data.categories.reduce((total, category) => total + category.items.length, 0);
  menuSummary.textContent = `${totalItems} lezzet · ${data.categories.length} kategori`;

  const contactButton = document.createElement("a");
  contactButton.className = "category-btn contact-btn";
  contactButton.textContent = "İletişim";
  contactButton.href = "#contact";
  contactButton.addEventListener("click", (event) => {
    event.preventDefault();
    contactSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveContact();
  });
  nav.appendChild(contactButton);

  const sections = [...document.querySelectorAll(".category-section")];
  const buttons = [...document.querySelectorAll(".category-btn")];

  function keepActiveButtonVisible(button) {
    if (!button) return;
    const targetTop = button.offsetTop - nav.clientHeight / 2 + button.offsetHeight / 2;
    nav.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
  }

  function setActiveButton(activeId) {
    buttons.forEach((button) => button.classList.toggle("active", button.dataset.target === activeId));
    contactButton.classList.remove("active");
    keepActiveButtonVisible(buttons.find((button) => button.dataset.target === activeId));
  }

  function setActiveContact() {
    buttons.forEach((button) => button.classList.remove("active"));
    contactButton.classList.add("active");
    keepActiveButtonVisible(contactButton);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visibleSection = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visibleSection) setActiveButton(visibleSection.target.id);
    },
    { rootMargin: "-15% 0px -55% 0px", threshold: 0.15 }
  );
  sections.forEach((section) => observer.observe(section));

  const contactObserver = new IntersectionObserver(
    ([entry]) => { if (entry?.isIntersecting) setActiveContact(); },
    { rootMargin: "-20% 0px -20% 0px", threshold: 0.2 }
  );
  if (contactSection) contactObserver.observe(contactSection);
  setActiveButton(sections[0].id);
}

document.querySelector(".sidebar-logo")?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

fetchMenu()
  .then(renderMenu)
  .catch((error) => {
    console.error("Menü yüklenemedi:", error);
    container.replaceChildren();
    const message = document.createElement("div");
    message.className = "menu-error";
    const title = document.createElement("strong");
    title.textContent = "Menü şu anda yüklenemiyor.";
    const detail = document.createElement("span");
    detail.textContent = "Lütfen kısa bir süre sonra tekrar deneyin.";
    message.append(title, detail);
    container.appendChild(message);
    menuSummary.textContent = "Menü bilgisi alınamadı";
  });
