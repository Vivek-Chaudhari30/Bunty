import { describe, expect, test } from "bun:test";
import { assistantBaseUrl, buildCaddyfile, validate, type DeployConfig } from "./src/caddyfile.ts";
import example from "../../infra/assistants.example.json";

const config: DeployConfig = {
  domain: "bunty.example.com",
  acmeEmail: "ops@example.com",
  routerPort: 8787,
  assistants: [
    { id: "chintu", gatewayPort: 7830 },
    { id: "sujal", gatewayPort: 7831 },
  ],
};

describe("Caddyfile", () => {
  test("router and one subdomain per assistant", () => {
    const out = buildCaddyfile(config);
    expect(out).toContain("router.bunty.example.com {\n\treverse_proxy router:8787");
    expect(out).toContain("chintu.bunty.example.com {\n\treverse_proxy host.docker.internal:7830");
    expect(out).toContain("sujal.bunty.example.com {\n\treverse_proxy host.docker.internal:7831");
    expect(out).toContain("email ops@example.com");
  });

  test("bad input is refused with every problem listed", () => {
    const errors = validate({
      ...config,
      domain: "not a domain",
      assistants: [
        { id: "Chintu!", gatewayPort: 7830 },
        { id: "sujal", gatewayPort: 7830 },
        { id: "sujal", gatewayPort: 8787 },
      ],
    });
    expect(errors.join("\n")).toContain("not a domain name");
    expect(errors.join("\n")).toContain('"Chintu!"');
    expect(errors.join("\n")).toContain("port 7830 is used twice");
    expect(errors.join("\n")).toContain('"sujal" is listed twice');
    expect(() => buildCaddyfile({ ...config, domain: "x" })).toThrow(/infra\/assistants.json/);
  });

  test("assistant URLs for the router", () => {
    expect(assistantBaseUrl(config, "chintu")).toBe("https://chintu.bunty.example.com");
  });

  test("the example file in infra/ is valid", () => {
    expect(validate(example as DeployConfig)).toEqual([]);
  });
});
