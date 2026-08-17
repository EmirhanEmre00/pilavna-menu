# Pilavna Menü

Pilavna için mobil uyumlu dijital menü ve parola korumalı yönetim paneli.

## Nasıl çalışır?

- Ana sayfa menüyü Supabase veritabanından okur.
- Supabase geçici olarak erişilemezse `menu.json` yedek olarak gösterilir.
- Yönetici Supabase Auth ile giriş yapar.
- Veritabanı güvenlik kuralları nedeniyle yalnızca `menu_admins` tablosunda bulunan kullanıcı menüyü değiştirebilir.
- Proje statik olarak GitHub Pages veya Natro üzerinden yayınlanabilir; çalışan bir Node.js sunucusu gerekmez.

## Supabase kurulumu

1. Supabase projesinde `supabase/schema.sql` dosyasını SQL Editor üzerinden çalıştırın.
2. `menu.json` içeriğini `menu_content` tablosundaki `id = 1` kaydının `content` alanına ekleyin.
3. Authentication > Users bölümünden yönetici kullanıcısını oluşturun.
4. Kullanıcının UUID değerini `menu_admins.user_id` alanına ekleyin.
5. `supabase-config.js` içindeki Project URL ve Publishable Key değerlerini kendi projenizle güncelleyin.

`Publishable Key` web sitesinde bulunabilir. `Secret Key`, eski `service_role` anahtarı ve database parolası hiçbir zaman bu dosyaya veya GitHub'a eklenmemelidir.

## Yönetici bilgileri

Panelde görünen kullanıcı adı `supabase-config.js` içindeki `adminUsername` değeridir. Supabase Auth tarafında kullanılan e-posta kullanıcıya gösterilmez. Parola düz metin olarak repoda tutulmaz; Supabase Auth tarafından yönetilir.

Parolayı değiştirmek için Supabase Dashboard > Authentication > Users bölümünden yönetici kullanıcısını açıp yeni parola belirleyin.

## Yerel kontrol

```powershell
npm test
```

Eski Node sunucusu yalnızca yerel servis ve doğrulama testleri için repoda korunmuştur. Canlı admin paneli doğrudan Supabase kullanır.
