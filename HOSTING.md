# Putting PlayMTG Online live (playmtg.online)

| Piece | Address | Where it runs |
| --- | --- | --- |
| Website | https://playmtg.online | Cloudflare Pages (project `playmtg`) |
| Game server | https://api.playmtg.online | Your PC, published through Cloudflare Tunnel `playmtg` |
| Accounts and data | Supabase project `manaforge` (London) | Supabase, already created with all tables and security rules |

Only the game server writes to the database (with the secret key). Browsers sign in with Supabase and can read only
their own rows, so nobody can change their gold from the browser. Payments are off ("free dev mode").

## 1. Supabase (5 minutes)

The project, tables and security rules already exist. `.env` already has the project address and public key.

1. Supabase → project **manaforge** → **Project Settings → API Keys**. Copy the **secret** key (`sb_secret_…`; the
   legacy `service_role` key also works) and paste it after `SUPABASE_SERVICE_ROLE_KEY=` in `.env`. Never share it.
2. **Authentication → URL Configuration**: **Site URL** `https://playmtg.online`. Under **Redirect URLs** add
   `https://playmtg.online/**` and `http://localhost:8787/**`.
3. In `.env` set `ALLOW_ORIGIN=https://playmtg.online,https://www.playmtg.online`.

## 2. Put the domain on Cloudflare

- Bought at Cloudflare: it's already there, skip this.
- Bought elsewhere: Cloudflare dashboard → **Add a domain** → `playmtg.online` → Free plan. Cloudflare shows two
  nameservers; set them at the shop where you bought the domain. It turns "Active" within minutes to a few hours.

## 3. Game server

Double-click `start-server.bat`. The window should say `Accounts: Supabase (iiorqgdjlgwvqwgmnnwd.supabase.co)`.
Test it at http://localhost:8787.

## 4. Tunnel: api.playmtg.online → your PC (once)

```
winget install --id Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create playmtg
cloudflared tunnel route dns playmtg api.playmtg.online
```

`login` opens the browser: pick `playmtg.online`. `create` prints a tunnel ID and the path of a `.json` file.
Copy `cloudflared\config.example.yml` to `C:\Users\<you>\.cloudflared\config.yml` and fill in your user name and
that ID. Then double-click `start-tunnel.bat` and open https://api.playmtg.online/api/status. It should show the
card count.

## 5. Website: playmtg.online (once, then whenever the site changes)

1. Double-click `deploy-site.bat`. The first time, it opens the browser to log in to Cloudflare and creates the
   Pages project `playmtg` (choose production branch `main` if asked). It uses `.env.production`, which already
   points the site at `https://api.playmtg.online`.
2. Cloudflare → **Workers & Pages → playmtg → Custom domains → Set up a custom domain**: add `playmtg.online`,
   then `www.playmtg.online`.
3. Open https://playmtg.online.

## 6. Search engines (once the site is live)

- Google Search Console: add the domain `playmtg.online` (Cloudflare can verify it for you), then submit
  `https://playmtg.online/sitemap.xml`.
- Bing Webmaster Tools: import from Search Console.

The site already has the title and description, the social preview image (`og.png`), `robots.txt`, `sitemap.xml`,
a readable home page for crawlers and the Wizards fan-content notice.

## Every day you host

Start `start-server.bat` and `start-tunnel.bat`. When the PC is off, the site still loads and shows that the game
server can't be reached.
