# Pilavna Menü

Pilavna için mobil uyumlu dijital menü ve parola korumalı yönetim paneli.

## Özellikler

- Ziyaretçiler için hızlı ve responsive menü
- Sağ alttaki Pilavna logosundan yönetim paneline geçiş
- Kategori ve ürün ekleme, silme, düzenleme ve sıralama
- Değişiklikleri `menu.json` dosyasına kalıcı kaydetme
- Parolayı düz metin yerine `scrypt` hash olarak saklama
- `HttpOnly` oturum çerezi, CSRF koruması ve giriş denemesi sınırlama
- Harici npm paketine ihtiyaç duymayan Node.js sunucusu

## Yerelde çalıştırma

Node.js 20 veya üzeri gerekir.

```powershell
npm run admin:set-password -- --username admin
npm start
```

İlk komut güvenli bir parola üretir ve yalnızca o anda terminalde gösterir. Ayarlar `.env` dosyasına yazılır; parola burada düz metin olarak tutulmaz.

- Menü: `http://localhost:3000`
- Yönetim: `http://localhost:3000/admin`

Belirli bir parola kullanmak için:

```powershell
npm run admin:set-password -- --username admin --password "EnAz12Karakter!"
```

## Canlıya alma

Yönetim paneli sunucu tarafında çalıştığı için proje yalnızca GitHub Pages gibi statik bir serviste barındırılamaz. Node.js çalıştıran ve kalıcı disk sunan bir hizmet kullanın.

Canlı ortam değişkenleri:

```text
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=scrypt:...
SESSION_SECRET=uzun-rastgele-bir-deger
NODE_ENV=production
TRUST_PROXY=true
MENU_DATA_FILE=/kalici-disk/menu.json
```

`ADMIN_PASSWORD_HASH` ve `SESSION_SECRET` değerlerini en kolay şekilde yerelde `npm run admin:set-password` ile oluşturup barındırma hizmetinin gizli ortam değişkenlerine ekleyebilirsiniz. `.env` dosyasını GitHub'a yüklemeyin.

Kalıcı disk kullanılmayan sunucularda dosya değişiklikleri yeniden başlatma veya yeni dağıtım sırasında kaybolabilir. Bu nedenle `MENU_DATA_FILE` için kalıcı bir disk yolu tanımlayın.

## Test

```powershell
npm test
```

Yönetici parolasını daha sonra değiştirmek için `npm run admin:set-password` komutunu tekrar çalıştırın ve sunucuyu yeniden başlatın.
