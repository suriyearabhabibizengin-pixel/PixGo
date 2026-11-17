# PixGo – Çok Oyunculu Kurulum

Bu klasördeki dosyalar oyunu herkesin aynı haritada oynadığı, birbirine yazabildiği hale getirir.

| Dosya | Ne işe yarar |
|---|---|
| `index.html` | Oyunun kendisi (çok oyunculu ve sohbet eklendi) |
| `config.js` | Sunucu adresini yazdığın küçük ayar dosyası |
| `worker.js` | Cloudflare sunucusu (pikselleri ve sohbeti tutar, herkese dağıtır) |
| `wrangler.toml` | Cloudflare'e sunucunun nasıl kurulacağını söyleyen ayar |
| `README.md` | Bu yazı |

> Socket.io yerine Cloudflare'in kendi WebSocket'i kullanıldı. Socket.io Cloudflare Workers'ta çalışmaz, WebSocket aynı işi yapar.

## Kurulum (telefondan, bilgisayar gerekmez)

**1. GitHub'a yükle.** PixGo reposuna bu 5 dosyanın hepsini yükle (**Add file → Upload files**). `index.html` zaten var, aynı isimle yükleyince yenisi eskisinin yerine geçer.

**2. Cloudflare hesabı aç.** `dash.cloudflare.com` adresinden ücretsiz hesap aç.

**3. Sunucuyu kur.**
- Cloudflare panelinde **Workers & Pages → Create** de.
- **Import a repository** (GitHub'dan al) seçeneğini seç ve GitHub hesabını bağla.
- **PixGo** reposunu seç.
- Proje adı `pixgo-server` olsun (`wrangler.toml` içindeki `name` ile aynı).
- Deploy komutu `npx wrangler deploy` kalsın ve **Deploy**'a bas.

Menü adları zamanla biraz değişebilir, mantık aynı: GitHub reposunu Cloudflare'e bağlayıp yayınlıyorsun.

**4. Sunucu adresini al.** Yayınlanınca şuna benzer bir adres verir: `https://pixgo-server.KULLANICI.workers.dev`. Tarayıcıda açınca "PixGo sunucusu çalışıyor ✅" yazmalı.

**5. Adresi oyuna yaz.** GitHub'da `config.js` dosyasını aç, kalem ikonuna bas ve şunu yaz (KULLANICI yerine kendi adın):
```js
window.PIXGO_CONFIG = {
  WS_URL: "wss://pixgo-server.KULLANICI.workers.dev/ws"
};
```
Başı `https://` değil **`wss://`**, sonu **`/ws`** olacak. Commit et. 1 dakika sonra oyun sunucuya bağlanır.

**6. Test et.** Oyunu iki telefonda aç. Sol üstte kalemin altında 💬 butonu ve yeşil nokta ile kaç kişinin online olduğu görünür. Birinin bastığı piksel diğerinde de çıkar.

**7. İlk harita (admin).** Ayarlar → **Çok oyunculu → Haritamı sunucuya gönder**. Sunucu ilk başta boştur, bu buton senin cihazındaki pikselleri herkese gönderir. Bir kere yeterli.

## İzin verilen adres

`wrangler.toml` içindeki `ALLOWED_ORIGINS`, oyunun hangi sitelerden sunucuya bağlanabileceğini belirler. Şu an sadece `https://suriyearabhabibizengin-pixel.github.io` yazıyor. Oyunu başka bir adrese taşırsan oraya ekle (virgülle ayırarak).

## Ne eşitleniyor, ne eşitlenmiyor

**Eşitlenenler:** herkesin bastığı pikseller (3 dünya) ve sohbet.

**Henüz eşitlenmeyenler** (her cihazda ayrı çalışır): Void, Kaos, kayan yazı duyurusu, admin araçları (pikselleri silme, geri alma), piksel hakkı sayacı ve admin girişi.

## Dürüst notlar

- Bu dosyalar henüz gerçek Cloudflare'de denenmedi. Sunucu mantığını bilgisayarda sahte bağlantılarla test ettim, ama ilk kurulumda bir şey takılırsa ekran görüntüsü at.
- Piksel hakkı ve admin kontrolü oyunun içinde (tarayıcıda) çalışıyor. İsteyen biri kodu değiştirip sınırsız piksel basabilir. Arkadaş grubu için sorun olmaz, herkese açık büyük bir oyun olursa kontrolü sunucuya taşımak gerekir.
- Ücretsiz Cloudflare planının günlük limitleri var. Küçük bir arkadaş grubuna yeter.

## Bilgisayarın varsa (isteğe bağlı)

```
npm install -g wrangler
wrangler login
wrangler deploy
```
