# website

The Bunty landing page. One static page: plain HTML and CSS with one small script. No framework, no build step.

## Run it locally

    cd website
    python3 -m http.server 8080

Open http://localhost:8080. Asset links are root paths (/assets/...), so open it through a server, not by double-clicking the file.

## Deploy (Hostinger)

- Upload the contents of this folder (not the folder itself) into public_html, including the hidden .htaccess.
- .htaccess forces HTTPS, redirects www to the bare domain, sets caching and security headers, and sends unknown paths to the home page.
- _headers is only for Cloudflare Pages and is ignored on Hostinger.
- Automatic: pushing changes under website/ to main runs .github/workflows/website-deploy.yml. It copies the contents of this folder (without README.md and _headers) onto the website-deploy branch, and Hostinger deploys that branch into public_html. Manual upload still works.

### One-time setup for automatic deploys

1. On GitHub, run the workflow once: Actions, Website deploy branch, Run workflow. This creates the website-deploy branch.
2. In hPanel: Websites, your site, Advanced, GIT.
   - Repository: git@github.com:Vivek-Chaudhari30/Bunty.git
   - Branch: website-deploy
   - Directory: leave empty, so files go straight into public_html (public_html must be empty the first time).
3. The repo is private: copy the SSH key hPanel shows, then on GitHub open the repo, Settings, Deploy keys, Add deploy key, paste it, and leave write access off.
4. Back in hPanel, click Create, then Deploy once.
5. Turn on Auto Deployment in hPanel and copy its webhook URL. On GitHub: Settings, Webhooks, Add webhook, paste the URL, content type application/json, "Just the push event".

Steps 3 and 5 need admin access to the GitHub repo.

## What is where

| Path | What it is |
| --- | --- |
| index.html | The whole site, two screens: headline with Call and WhatsApp buttons and a rotating example; then a dark box with the two ways to reach Bunty and a scrollable WhatsApp phone demo |
| assets/site.css | All styles. Colours, spacing, radius and shadows are CSS variables at the top |
| assets/site.js | Scroll reveal, button lean, rotating example, mouse light in the box, phone chat playing in |
| assets/fonts/ | Self-hosted subset woff2 files (SIL Open Font Licence) |
| favicon.svg | The bunty.si mark |

## Design rules

- White page, black text (#0A0A0A), red-orange (#F2300E) and orange (#FF8C42) accents. Small red-orange text uses #C0280C (WCAG AA).
- Plain words for non-technical readers. Motion stops with prefers-reduced-motion.
- [TBD] marks unknown values (phone number, WhatsApp link). Replace before launch.
