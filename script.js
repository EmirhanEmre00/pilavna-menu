const nav = document.getElementById("categoryNav");
const container = document.getElementById("menuContainer");
const contactSection = document.getElementById("contact");
const menuSummary = document.getElementById("menuSummary");
const sidebar = document.querySelector(".sidebar");
const priceFormatter = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const mobileNavMedia = window.matchMedia("(max-width: 680px)");
let mobileNavFrame = 0;

function syncMobileNavPosition() {
  sidebar?.classList.toggle("is-pinned", mobileNavMedia.matches && window.scrollY > 18);
}

function scheduleMobileNavSync() {
  if (mobileNavFrame) return;
  mobileNavFrame = window.requestAnimationFrame(() => {
    syncMobileNavPosition();
    mobileNavFrame = 0;
  });
}

window.addEventListener("scroll", scheduleMobileNavSync, { passive: true });
mobileNavMedia.addEventListener("change", syncMobileNavPosition);
syncMobileNavPosition();

async function fetchMenu() {
  const config = window.PILAVNA_SUPABASE;
  if (config?.url && config?.publishableKey) {
    try {
      const apiResponse = await fetch(
        `${config.url.replace(/\/$/, "")}/rest/v1/menu_content?select=content&id=eq.1`,
        {
          cache: "no-store",
          headers: {
            apikey: config.publishableKey,
            Accept: "application/json"
          }
        }
      );
      if (apiResponse.ok) {
        const rows = await apiResponse.json();
        if (rows[0]?.content) return rows[0].content;
      }
    } catch (error) {
      console.warn("Canlı menü verisine ulaşılamadı, yerel menü kullanılacak:", error);
    }
  }

  // Supabase geçici olarak erişilemezse menü tamamen kaybolmasın.
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

  const leader = document.createElement("span");
  leader.className = "menu-leader";
  leader.setAttribute("aria-hidden", "true");

  const price = document.createElement("div");
  price.className = "price";
  price.textContent = `${priceFormatter.format(Number(item.price))}₺`;

  const headline = document.createElement("div");
  headline.className = "menu-item-headline";
  headline.append(name, leader, price);
  itemLeft.appendChild(headline);

  if (item.description) {
    const description = document.createElement("p");
    description.className = "item-desc";
    description.textContent = item.description;
    itemLeft.appendChild(description);
  }

  row.appendChild(itemLeft);
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
    const navIndex = document.createElement("span");
    navIndex.className = "category-nav-index";
    navIndex.setAttribute("aria-hidden", "true");
    navIndex.textContent = String(index + 1).padStart(2, "0");
    const navLabel = document.createElement("span");
    navLabel.className = "category-nav-label";
    navLabel.textContent = category.shortName || category.name;
    navButton.append(navIndex, navLabel);
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
    const heading = document.createElement("div");
    heading.className = "category-heading-main";
    const categoryIndex = document.createElement("span");
    categoryIndex.className = "category-index";
    categoryIndex.setAttribute("aria-hidden", "true");
    categoryIndex.textContent = String(index + 1).padStart(2, "0");
    const title = document.createElement("h2");
    title.className = "category-title";
    title.textContent = category.name;
    const count = document.createElement("span");
    count.className = "category-count";
    count.textContent = `${category.items.length} çeşit`;
    heading.append(categoryIndex, title);
    header.append(heading, count);

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
  const contactIcon = document.createElement("span");
  contactIcon.className = "category-nav-index";
  contactIcon.setAttribute("aria-hidden", "true");
  contactIcon.textContent = "✦";
  const contactLabel = document.createElement("span");
  contactLabel.className = "category-nav-label";
  contactLabel.textContent = "İletişim";
  contactButton.append(contactIcon, contactLabel);
  contactButton.href = "#contact";
  contactButton.addEventListener("click", (event) => {
    event.preventDefault();
    contactSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveContact();
  });
  nav.appendChild(contactButton);

  const sections = [...document.querySelectorAll(".category-section")];
  const buttons = [...document.querySelectorAll(".category-btn")];
  let currentActiveKey = "";
  let scrollSpyFrame = 0;

  function keepActiveButtonVisible(button) {
    if (!button) return;
    const navRect = nav.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const isHorizontal = window.getComputedStyle(nav).flexDirection === "row";

    if (isHorizontal) {
      const targetLeft = nav.scrollLeft + buttonRect.left - navRect.left - (navRect.width - buttonRect.width) / 2;
      nav.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
      return;
    }

    const targetTop = nav.scrollTop + buttonRect.top - navRect.top - (navRect.height - buttonRect.height) / 2;
    nav.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
  }

  function setActiveButton(activeId) {
    if (currentActiveKey === activeId) return;
    currentActiveKey = activeId;
    buttons.forEach((button) => button.classList.toggle("active", button.dataset.target === activeId));
    contactButton.classList.remove("active");
    keepActiveButtonVisible(buttons.find((button) => button.dataset.target === activeId));
  }

  function setActiveContact() {
    if (currentActiveKey === "contact") return;
    currentActiveKey = "contact";
    buttons.forEach((button) => button.classList.remove("active"));
    contactButton.classList.add("active");
    keepActiveButtonVisible(contactButton);
  }

  function updateActiveFromScroll() {
    const activationLine = mobileNavMedia.matches
      ? (sidebar?.getBoundingClientRect().bottom || 0) + 16
      : window.innerHeight * 0.28;

    if (contactSection && contactSection.getBoundingClientRect().top <= activationLine) {
      setActiveContact();
      return;
    }

    let activeSection = sections[0];
    for (const section of sections) {
      if (section.getBoundingClientRect().top > activationLine) break;
      activeSection = section;
    }
    setActiveButton(activeSection.id);
  }

  function scheduleScrollSpy() {
    if (scrollSpyFrame) return;
    scrollSpyFrame = window.requestAnimationFrame(() => {
      updateActiveFromScroll();
      scrollSpyFrame = 0;
    });
  }

  window.addEventListener("scroll", scheduleScrollSpy, { passive: true });
  mobileNavMedia.addEventListener("change", updateActiveFromScroll);
  updateActiveFromScroll();
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
