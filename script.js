fetch("menu.json")
  .then((response) => response.json())
  .then((data) => {
    const nav = document.getElementById("categoryNav");
    const container = document.getElementById("menuContainer");

    nav.innerHTML = "";
    container.innerHTML = "";

    data.categories.forEach((category, index) => {
      const sectionId = `category-${index}`;

      const navButton = document.createElement("button");
      navButton.type = "button";
      navButton.className = "category-btn";
      navButton.textContent = category.shortName || category.name;
      navButton.dataset.target = sectionId;

      navButton.addEventListener("click", () => {
        const target = document.getElementById(sectionId);
        if (!target) return;

        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

        setActiveButton(sectionId);
      });

      nav.appendChild(navButton);

      const section = document.createElement("section");
      section.className = "category-section";
      section.id = sectionId;

      const itemsHtml = category.items
        .map((item) => {
          return `
            <div class="menu-row">
              <div class="item-left">
                <h3 class="item-name">${item.name}</h3>
                ${item.description ? `<p class="item-desc">${item.description}</p>` : ""}
              </div>
              <div class="price">${item.price}₺</div>
            </div>
          `;
        })
        .join("");

      section.innerHTML = `
        <div class="category-header">
          <h2 class="category-title">${category.name}</h2>
        </div>
        <div class="menu-list">
          ${itemsHtml}
        </div>
      `;

      container.appendChild(section);
    });

    const contactBtn = document.createElement("a");
    contactBtn.className = "category-btn contact-btn";
    contactBtn.textContent = "İletişim";
    contactBtn.href = "#contact";

    contactBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const contactSection = document.getElementById("contact");
      if (!contactSection) return;

      contactSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

      buttons.forEach((btn) => btn.classList.remove("active"));
      contactBtn.classList.add("active");
    });

    nav.appendChild(contactBtn);

    const sections = document.querySelectorAll(".category-section");
    const buttons = document.querySelectorAll(".category-btn");

    function setActiveButton(activeId) {
      buttons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.target === activeId);
      });
      contactBtn.classList.remove("active");
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleSection = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visibleSection) {
          setActiveButton(visibleSection.target.id);
        }
      },
      {
        threshold: 0.35
      }
    );

    sections.forEach((section) => observer.observe(section));

    if (sections.length > 0) {
      setActiveButton(sections[0].id);
    }

    const sidebarLogo = document.querySelector(".sidebar-logo");
    if (sidebarLogo) {
      sidebarLogo.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  })
  .catch((error) => {
    console.error("Menü yüklenemedi:", error);
  });