# website

The Bunty landing page. One static page: plain HTML and CSS with one small script. No framework, no build step.

## Run it locally

    cd website
    python3 -m http.server 8080

Open http://localhost:8080. Asset links are root paths (/assets/...), so open it through a server, not by double-clicking the file.

## Deploy (Cloudflare Pages)

- Build command: none
- Build output directory: website
- _headers sets long caching for fonts and basic security headers.

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
