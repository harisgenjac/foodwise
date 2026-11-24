// The development tools for the mock delivery provider: the order page's "Simulacija kurira" panel
// and the mock's tracking page (/dev/tracking/:deliveryId). On in the dev server, and in a build
// made with VITE_DEV_TOOLS=true (the e2e build, which runs against a server with the mock); never in
// a production build. The server's dev routes they call exist only outside production anyway.
export const DEV_TOOLS: boolean = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === "true";
