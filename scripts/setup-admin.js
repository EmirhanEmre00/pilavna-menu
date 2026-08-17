import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(projectRoot, ".env");

function getArgument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function generatePassword() {
  return `${randomBytes(6).toString("base64url")}!${randomBytes(6).toString("base64url")}`;
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

let current = "";
try {
  current = readFileSync(envPath, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const currentValues = parseEnv(current);
const username = (getArgument("username") || currentValues.get("ADMIN_USERNAME") || "admin").trim();
const suppliedPassword = getArgument("password");
const password = suppliedPassword || generatePassword();

if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
  console.error("Kullanıcı adı 3-40 karakter olmalı ve yalnızca harf, rakam, nokta, tire veya alt çizgi içermelidir.");
  process.exit(1);
}

if (password.length < 12 || password.length > 200) {
  console.error("Parola 12-200 karakter arasında olmalıdır.");
  process.exit(1);
}

const nextValues = new Map(currentValues);
nextValues.set("PORT", nextValues.get("PORT") || "3000");
nextValues.set("ADMIN_USERNAME", username);
nextValues.set("ADMIN_PASSWORD_HASH", hashPassword(password));
nextValues.set("SESSION_SECRET", nextValues.get("SESSION_SECRET") || randomBytes(48).toString("base64url"));
nextValues.set("NODE_ENV", nextValues.get("NODE_ENV") || "development");
nextValues.set("TRUST_PROXY", nextValues.get("TRUST_PROXY") || "false");

const preferredOrder = [
  "PORT",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD_HASH",
  "SESSION_SECRET",
  "NODE_ENV",
  "MENU_DATA_FILE",
  "TRUST_PROXY"
];

const outputKeys = [
  ...preferredOrder.filter((key) => nextValues.has(key)),
  ...[...nextValues.keys()].filter((key) => !preferredOrder.includes(key))
];

writeFileSync(
  envPath,
  `${outputKeys.map((key) => `${key}=${nextValues.get(key)}`).join("\n")}\n`,
  { encoding: "utf8", mode: 0o600 }
);

console.log("Yönetici bilgileri hazırlandı.");
console.log(`Kullanıcı adı: ${username}`);
console.log(`Parola: ${password}`);
console.log("Bu parolayı güvenli bir yerde saklayın; .env içinde yalnızca hash değeri tutulur.");
