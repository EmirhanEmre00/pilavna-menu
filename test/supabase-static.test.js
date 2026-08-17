import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("public Supabase configuration never contains a privileged key", async () => {
  const config = await source("supabase-config.js");
  assert.match(config, /sb_publishable_/);
  assert.doesNotMatch(config, /sb_secret_|service_role/i);
});

test("menu and admin pages load Supabase configuration before their application code", async () => {
  const [index, admin] = await Promise.all([source("index.html"), source("admin.html")]);
  assert.ok(index.indexOf("supabase-config.js") < index.indexOf("script.js"));
  assert.ok(admin.indexOf("supabase-config.js") < admin.indexOf("admin.js"));
});

test("static clients use Supabase instead of the unavailable local admin API", async () => {
  const [menuClient, adminClient] = await Promise.all([source("script.js"), source("admin.js")]);
  assert.match(menuClient, /rest\/v1\/menu_content/);
  assert.match(adminClient, /auth\/v1\/token\?grant_type=password/);
  assert.match(adminClient, /rest\/v1\/menu_content/);
  assert.doesNotMatch(adminClient, /\/api\/admin/);
});

test("mobile admin editor uses compact cards and page-bottom actions", async () => {
  const [admin, adminClient, adminStyles] = await Promise.all([
    source("admin.html"),
    source("admin.js"),
    source("admin.css"),
  ]);

  assert.match(admin, /data-action="toggle-category"/);
  assert.match(admin, /class="category-card-body"/);
  assert.ok(admin.indexOf('id="editor"') < admin.indexOf('class="dashboard-actions"'));
  assert.match(adminClient, /expandedCategories/);
  assert.match(adminStyles, /\.category-card\.is-collapsed \.category-card-body\s*\{\s*display:\s*none/);
  assert.match(adminStyles, /\.dashboard-actions\s*\{[\s\S]*?position:\s*static/);
  assert.match(adminStyles, /\.category-card-header\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(adminStyles, /\.category-heading\s*\{[^}]*white-space:\s*normal/);
});
