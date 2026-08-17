import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
loadLocalEnv(resolve(ROOT, ".env"));

const PORT = parsePort(process.env.PORT || "3000");
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const MENU_FILE = process.env.MENU_DATA_FILE
  ? resolve(ROOT, process.env.MENU_DATA_FILE)
  : resolve(ROOT, "menu.json");
const SEED_MENU_FILE = resolve(ROOT, "menu.json");

const SESSION_COOKIE = "pilavna_admin";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const sessions = new Map();
const loginAttempts = new Map();

const staticFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/style.css", "style.css"],
  ["/script.js", "script.js"],
  ["/supabase-config.js", "supabase-config.js"],
  ["/admin", "admin.html"],
  ["/admin/", "admin.html"],
  ["/admin.html", "admin.html"],
  ["/admin.css", "admin.css"],
  ["/admin.js", "admin.js"]
]);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"]
]);

function loadLocalEnv(filePath) {
  try {
    const source = requireTextFile(filePath);
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || Object.hasOwn(process.env, match[1])) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function requireTextFile(filePath) {
  // Senkron okuma yalnızca süreç başlarken .env yüklemek için kullanılır.
  return readFileSync(filePath, "utf8");
}

function parsePort(rawValue) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("PORT 1-65535 arasında geçerli bir sayı olmalıdır.");
  }
  return value;
}

function securityHeaders() {
  return {
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' https://ddwoxswosizcrxhuueqv.supabase.co; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin"
  };
}

function send(res, statusCode, body = "", headers = {}) {
  res.writeHead(statusCode, { ...securityHeaders(), ...headers });
  res.end(body);
}

function sendJson(res, statusCode, payload, headers = {}) {
  send(res, statusCode, JSON.stringify(payload), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
}

function apiError(res, statusCode, message) {
  sendJson(res, statusCode, { ok: false, message });
}

async function readJsonBody(req, maxBytes = 1_100_000) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error("İstek gövdesi çok büyük.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("Geçersiz JSON verisi.");
    error.statusCode = 400;
    throw error;
  }
}

function getClientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function parseCookies(req) {
  const values = new Map();
  const source = req.headers.cookie || "";
  for (const part of source.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    values.set(part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim()));
  }
  return values;
}

function signSessionId(sessionId) {
  const signature = createHmac("sha256", SESSION_SECRET).update(sessionId).digest("base64url");
  return `${sessionId}.${signature}`;
}

function verifySignedSession(value) {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const sessionId = value.slice(0, separator);
  const expected = signSessionId(sessionId);
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  return sessionId;
}

function getSession(req) {
  const signedId = parseCookies(req).get(SESSION_COOKIE);
  const sessionId = verifySignedSession(signedId);
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { id: sessionId, ...session };
}

function buildSessionCookie(value, maxAgeSeconds) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`
  ];
  if (IS_PRODUCTION) parts.push("Secure");
  return parts.join("; ");
}

export function verifyPassword(password, storedHash) {
  if (typeof password !== "string" || typeof storedHash !== "string") return false;
  const [algorithm, saltText, hashText] = storedHash.split(":");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const stored = Buffer.from(hashText, "base64url");
    const actual = scryptSync(password, salt, stored.length);
    return stored.length === actual.length && timingSafeEqual(stored, actual);
  } catch {
    return false;
  }
}

function isLoginBlocked(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordFailedLogin(ip) {
  const current = loginAttempts.get(ip);
  if (!current || Date.now() - current.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, startedAt: Date.now() });
    return;
  }
  current.count += 1;
}

function cleanText(value, label, maxLength, { required = true } = {}) {
  if (typeof value !== "string") throw new Error(`${label} metin olmalıdır.`);
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (required && !cleaned) throw new Error(`${label} boş bırakılamaz.`);
  if (cleaned.length > maxLength) throw new Error(`${label} en fazla ${maxLength} karakter olabilir.`);
  return cleaned;
}

export function validateMenu(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.categories)) {
    throw new Error("Menü kategorileri geçersiz.");
  }
  if (input.categories.length < 1 || input.categories.length > 50) {
    throw new Error("Menüde 1-50 kategori bulunmalıdır.");
  }

  let itemCount = 0;
  const categories = input.categories.map((category, categoryIndex) => {
    if (!category || typeof category !== "object" || !Array.isArray(category.items)) {
      throw new Error(`${categoryIndex + 1}. kategorinin ürün listesi geçersiz.`);
    }
    if (category.items.length > 100) {
      throw new Error("Bir kategoride en fazla 100 ürün olabilir.");
    }
    itemCount += category.items.length;
    if (itemCount > 1000) throw new Error("Menüde en fazla 1000 ürün olabilir.");

    return {
      name: cleanText(category.name, "Kategori adı", 80),
      shortName: cleanText(category.shortName || category.name, "Kısa kategori adı", 40),
      items: category.items.map((item, itemIndex) => {
        if (!item || typeof item !== "object") {
          throw new Error(`${categoryIndex + 1}. kategorideki ${itemIndex + 1}. ürün geçersiz.`);
        }
        const price = Number(item.price);
        if (!Number.isFinite(price) || price < 0 || price > 1_000_000) {
          throw new Error(`${item.name || itemIndex + 1} için fiyat geçersiz.`);
        }
        return {
          name: cleanText(item.name, "Ürün adı", 120),
          price: Math.round(price * 100) / 100,
          description: cleanText(item.description || "", "Ürün açıklaması", 300, { required: false })
        };
      })
    };
  });

  return { categories };
}

async function ensureMenuFile() {
  try {
    await stat(MENU_FILE);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await mkdir(dirname(MENU_FILE), { recursive: true });
    if (MENU_FILE !== SEED_MENU_FILE) await copyFile(SEED_MENU_FILE, MENU_FILE);
  }
}

async function readMenu() {
  await ensureMenuFile();
  return validateMenu(JSON.parse(await readFile(MENU_FILE, "utf8")));
}

async function writeMenu(menu) {
  const validated = validateMenu(menu);
  await mkdir(dirname(MENU_FILE), { recursive: true });
  const temporaryFile = join(dirname(MENU_FILE), `.${Date.now()}-${randomBytes(6).toString("hex")}.tmp`);
  await writeFile(temporaryFile, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  await rename(temporaryFile, MENU_FILE);
  return validated;
}

function requireSession(req, res, { csrf = false } = {}) {
  const session = getSession(req);
  if (!session) {
    apiError(res, 401, "Oturum süreniz doldu. Lütfen yeniden giriş yapın.");
    return null;
  }
  if (csrf && req.headers["x-csrf-token"] !== session.csrfToken) {
    apiError(res, 403, "Güvenlik doğrulaması başarısız oldu. Sayfayı yenileyin.");
    return null;
  }
  return session;
}

async function serveStatic(req, res, pathname) {
  let relativePath = staticFiles.get(pathname);
  if (!relativePath && pathname.startsWith("/images/")) {
    relativePath = pathname.slice(1);
  }
  if (!relativePath || relativePath.includes("..")) return false;

  const filePath = resolve(ROOT, relativePath);
  if (!filePath.startsWith(`${ROOT}\\`) && !filePath.startsWith(`${ROOT}/`)) return false;
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;
    const contentType = mimeTypes.get(extname(filePath).toLowerCase()) || "application/octet-stream";
    res.writeHead(200, {
      ...securityHeaders(),
      "Content-Type": contentType,
      "Content-Length": fileStat.size,
      "Cache-Control": contentType.startsWith("text/html") ? "no-store" : "public, max-age=3600"
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(filePath).pipe(res);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export function createRequestHandler() {
  return async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const pathname = decodeURIComponent(url.pathname);

      if (req.method === "GET" && pathname === "/api/menu") {
        sendJson(res, 200, await readMenu());
        return;
      }

      if (req.method === "POST" && pathname === "/api/admin/login") {
        const ip = getClientIp(req);
        if (isLoginBlocked(ip)) {
          apiError(res, 429, "Çok fazla hatalı deneme yapıldı. 15 dakika sonra tekrar deneyin.");
          return;
        }
        const body = await readJsonBody(req, 10_000);
        const usernameOk = typeof body.username === "string" && body.username === ADMIN_USERNAME;
        const passwordOk = verifyPassword(body.password, ADMIN_PASSWORD_HASH);
        if (!usernameOk || !passwordOk) {
          recordFailedLogin(ip);
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 350));
          apiError(res, 401, "Kullanıcı adı veya parola hatalı.");
          return;
        }

        loginAttempts.delete(ip);
        const sessionId = randomBytes(32).toString("base64url");
        const csrfToken = randomBytes(24).toString("base64url");
        sessions.set(sessionId, { csrfToken, expiresAt: Date.now() + SESSION_TTL_MS });
        sendJson(res, 200, { ok: true, username: ADMIN_USERNAME, csrfToken }, {
          "Set-Cookie": buildSessionCookie(signSessionId(sessionId), SESSION_TTL_MS / 1000)
        });
        return;
      }

      if (req.method === "GET" && pathname === "/api/admin/session") {
        const session = requireSession(req, res);
        if (!session) return;
        sendJson(res, 200, { ok: true, username: ADMIN_USERNAME, csrfToken: session.csrfToken });
        return;
      }

      if (req.method === "POST" && pathname === "/api/admin/logout") {
        const session = getSession(req);
        if (session) sessions.delete(session.id);
        sendJson(res, 200, { ok: true }, {
          "Set-Cookie": buildSessionCookie("", 0)
        });
        return;
      }

      if (req.method === "PUT" && pathname === "/api/admin/menu") {
        const session = requireSession(req, res, { csrf: true });
        if (!session) return;
        const menu = await writeMenu(await readJsonBody(req));
        sendJson(res, 200, { ok: true, menu });
        return;
      }

      if ((req.method === "GET" || req.method === "HEAD") && await serveStatic(req, res, pathname)) return;

      if (pathname.startsWith("/api/")) apiError(res, 404, "İstenen servis bulunamadı.");
      else send(res, 404, "Sayfa bulunamadı.", { "Content-Type": "text/plain; charset=utf-8" });
    } catch (error) {
      const statusCode = error.statusCode || (error instanceof URIError ? 400 : 500);
      if (statusCode >= 500) console.error(error);
      apiError(res, statusCode, statusCode >= 500 ? "Beklenmeyen bir sunucu hatası oluştu." : error.message);
    }
  };
}

export function validateConfiguration() {
  const missing = [];
  if (!ADMIN_USERNAME) missing.push("ADMIN_USERNAME");
  if (!ADMIN_PASSWORD_HASH) missing.push("ADMIN_PASSWORD_HASH");
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) missing.push("SESSION_SECRET (en az 32 karakter)");
  if (missing.length) {
    throw new Error(`Eksik yönetici ayarı: ${missing.join(", ")}. Önce \"npm run admin:set-password\" komutunu çalıştırın.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  validateConfiguration();
  await ensureMenuFile();
  const server = createServer(createRequestHandler());
  server.listen(PORT, () => {
    console.log(`Pilavna Menü http://localhost:${PORT} adresinde hazır.`);
  });
}
