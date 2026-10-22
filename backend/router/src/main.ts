// Starts the router. `bun run router` from the repo root, or `bun run start` here.
import { createWhatsAppSender, FetchForwarder } from "./adapters.ts";
import { createRouter } from "./app.ts";
import { loadConfig } from "./config.ts";
import { RouterStore } from "./store.ts";

const config = loadConfig();
const store = new RouterStore(config.dbPath);
const handle = createRouter({
  config,
  store,
  whatsapp: createWhatsAppSender(),
  forwarder: new FetchForwarder(),
  log: (msg, fields) => console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...fields })),
});

setInterval(() => store.pruneExpired(), 60 * 60 * 1000);

Bun.serve({ port: config.port, fetch: handle });
console.log(`router listening on :${config.port} (adapters: ${process.env.BUNTY_ADAPTERS === "real" ? "real" : "mock"})`);
