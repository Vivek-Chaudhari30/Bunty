# Bunty website

Static marketing site for the Bunty assistant prototype. It uses semantic HTML, modular CSS, and no JavaScript runtime or framework.

## Preview locally

From the repository root, run:

```bash
python3 -m http.server 8080 --directory website
```

Open `http://localhost:8080`. The site has no form, analytics script, external runtime dependency, or configured public phone or WhatsApp line.

## Deploy

Deploy the `website/` directory as the Cloudflare Pages root. The pages use relative links and `noindex` until the public domain is confirmed.
