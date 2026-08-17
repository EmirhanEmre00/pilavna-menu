import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import test from "node:test";
import { validateMenu, verifyPassword } from "../server.js";

function makePasswordHash(password) {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("base64url")}:${scryptSync(password, salt, 64).toString("base64url")}`;
}

test("doğru parola hash ile doğrulanır", () => {
  const hash = makePasswordHash("GuvenliBirParola!42");
  assert.equal(verifyPassword("GuvenliBirParola!42", hash), true);
  assert.equal(verifyPassword("yanlis-parola", hash), false);
});

test("menü verisi temizlenir ve fiyat sayıya dönüştürülür", () => {
  const result = validateMenu({
    categories: [{
      name: "  Pilavlar  ",
      shortName: " Pilav ",
      items: [{ name: " Tavuklu   Pilav ", price: "120.50", description: "  Günlük   tavuk  " }]
    }]
  });

  assert.deepEqual(result, {
    categories: [{
      name: "Pilavlar",
      shortName: "Pilav",
      items: [{ name: "Tavuklu Pilav", price: 120.5, description: "Günlük tavuk" }]
    }]
  });
});

test("boş kategori listesi reddedilir", () => {
  assert.throws(() => validateMenu({ categories: [] }), /1-50 kategori/);
});

test("geçersiz ürün fiyatı reddedilir", () => {
  assert.throws(() => validateMenu({
    categories: [{ name: "Pilavlar", shortName: "Pilav", items: [{ name: "Ürün", price: -1, description: "" }] }]
  }), /fiyat geçersiz/);
});

test("uzun alanlar reddedilir", () => {
  assert.throws(() => validateMenu({
    categories: [{ name: "x".repeat(81), shortName: "Pilav", items: [] }]
  }), /en fazla 80 karakter/);
});
