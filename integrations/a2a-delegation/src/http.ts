// Maps an ingress path to the service method. Route files and the test harness both use it.
import type { A2AService } from "./service.ts";

export type IngressPath = "pair" | "message" | "status" | "cancel" | "unpair" | "file";

export async function dispatch(service: A2AService, path: IngressPath, req: Request): Promise<Response> {
  const s = service as A2AService & {
    handleStatus?: (r: Request) => Promise<Response>;
    handleCancel?: (r: Request) => Promise<Response>;
    handleFile?: (r: Request) => Promise<Response>;
  };
  switch (path) {
    case "pair":
      return s.handlePair(req);
    case "message":
      return s.handleMessage(req);
    case "unpair":
      return s.handleUnpair(req);
    case "status":
      return s.handleStatus ? s.handleStatus(req) : new Response("not found", { status: 404 });
    case "cancel":
      return s.handleCancel ? s.handleCancel(req) : new Response("not found", { status: 404 });
    case "file":
      return s.handleFile ? s.handleFile(req) : new Response("not found", { status: 404 });
  }
}
