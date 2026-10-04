# Using moviemakerY2K on your phone

moviemakerY2K runs on your computer; your phone or tablet opens it in the
browser over your home network (OpenSpec change `add-mobile-delivery`). One
command serves the built app and the API on every network interface and
protects them with an access token.

```bash
pixi run serve-lan
```

The terminal shows every address of the computer with the token, for example
`http://192.168.178.46:8080/?token=…`, and a QR code of the first one. Scan it
with the phone camera (or open the link): the app loads, the address bar no
longer contains the token, and the phone stays signed in for 30 days.

> **Anyone with this link or QR code has access** to your pictures, music and
> movies. Share it only with your own devices.

## Options

| Option | Meaning |
|---|---|
| `--cert FILE --key FILE` | HTTPS with this certificate and key (PEM); default port 8443 |
| *(no certificate)* | plain HTTP; default port 8080 |
| `--port N` or `MMY_LAN_PORT=N` | another port |
| `--host ADDR` | bind to one address instead of all (`0.0.0.0`) |
| `--behind-proxy` | for `tailscale serve`: bind to `127.0.0.1` and trust `X-Forwarded-*` only from there |
| `--qr-host HOST` | show this host name or address as QR code (e.g. the Tailscale name) |
| `--rotate-token` | create a new token; old links and cookies stop working |

The token lives in `<MMY_DATA_DIR>/lan-token` (default `backend/.data/lan-token`),
readable only by your user (mode 0600). It is created on the first start and
reused afterwards, so a restart keeps your phone signed in. `pixi run dev` and
`pixi run demo` stay on `127.0.0.1` without a token.

If the phone shows **Access required**, it has no valid token (first visit
without the link, cookie expired, or the token was rotated): open the link or
scan the QR code from the terminal again.

## HTTPS: installing the app and sharing movies

Over plain `http://192.168.x.y` everything works except two features that
browsers allow only on a *secure context* (HTTPS or `localhost`):

- **Install as app** (*Tools → Install as app…*, also in *3. Finish Movie*):
  the app gets its own icon on the home screen and opens without the browser
  bar. On Android Chrome shows its install dialog; on iOS a dialog explains
  *Share → Add to Home Screen*.
- **Share…** in the last step of the *Save Movie* wizard opens the phone's
  share sheet with the MP4 (up to 200 MB; larger files: *Download*).

Over HTTPS the app also keeps its shell in a service worker, so it starts
even while the computer is off and then reports that the backend is not
reachable. After an update it shows *New version available* with *Reload*.
Build with `MMY_PWA=off` to ship a service worker that removes itself.

There are two ways to HTTPS; neither needs code in this project.

### Way 1: Tailscale (recommended, also away from home)

[Tailscale](https://tailscale.com/) connects your devices in a private
network and issues real certificates for `*.ts.net` names. Install it on the
computer and the phone and sign in with the same account; enable *MagicDNS*
and *HTTPS certificates* in the admin console.

```bash
pixi run serve-lan --behind-proxy --port 8080 --qr-host <device>.<tailnet>.ts.net
tailscale serve --bg 8080
```

Scan the QR code: the app opens at `https://<device>.<tailnet>.ts.net/` without
a certificate warning, at home and on the go. `tailscale serve` only exposes
the port inside your tailnet; stop it with `tailscale serve reset`.

### Way 2: mkcert in the home network

[mkcert](https://github.com/FiloSottile/mkcert) creates a local certificate
authority (CA) and certificates signed by it.

```bash
mkcert -install
mkcert -cert-file lan.pem -key-file lan-key.pem 192.168.178.46 "$(hostname)" "$(hostname).local"
pixi run serve-lan --cert lan.pem --key lan-key.pem
```

Use the LAN address of your computer instead of `192.168.178.46`. The phone
must trust the CA once; its file is `rootCA.pem` in `mkcert -CAROOT`:

- **iOS/iPadOS**: send `rootCA.pem` to the device (AirDrop, mail), install it
  under *Settings → General → VPN & Device Management*, then turn on full
  trust under *Settings → General → About → Certificate Trust Settings*.
- **Android**: copy `rootCA.pem` to the device and install it under
  *Settings → Security → Encryption & credentials → Install a certificate →
  CA certificate* (names vary by manufacturer). Chrome uses the user CA store.

If the address of your computer changes (DHCP), create a new certificate or
reserve the address in your router.

## Security limits

- **The token is in the link and the QR code.** Whoever gets it has full
  access until you run `--rotate-token`. There are no user accounts.
- **Plain HTTP is not encrypted.** Without a certificate the token, the
  cookie and your pictures travel readable through the network. Use HTTP only
  in a network you trust; prefer Tailscale.
- **The app shell is public.** HTML, scripts, styles, manifest, icons and the
  service worker load without a token; they contain no data. Everything under
  `/api/` (media, project, exports) needs the token.
- **The cookie** `mmy_access` is `HttpOnly` and `SameSite=Strict`, valid for
  30 days, and `Secure` over HTTPS (also behind `tailscale serve`).
- `serve-lan` is meant for your own devices, not for the internet: do not
  forward its port in your router.
