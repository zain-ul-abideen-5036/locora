"use client";

/**
 * The last resort.
 *
 * Catches an error thrown in the root layout itself, which is the one case
 * `error.tsx` cannot: if the layout failed, there is no layout to render an
 * error inside. So this replaces the whole document, which is why it renders
 * its own `<html>` and `<body>`.
 *
 * It also cannot rely on anything the layout would normally provide — the
 * stylesheet is imported by the layout, so Tailwind classes may not be
 * available here. Styles are therefore inline. That looks primitive and is
 * correct: a fallback that depends on the thing that just broke is not a
 * fallback.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: "#fbfaf8",
          color: "#161d29",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <p style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#17335c", margin: 0 }}>
            Locora
          </p>
          <h1 style={{ fontSize: "1.75rem", lineHeight: 1.2, margin: "1.25rem 0 0" }}>
            Locora could not load
          </h1>
          <p style={{ fontSize: "0.9375rem", lineHeight: 1.6, color: "#55617a", marginTop: "0.75rem" }}>
            Something failed before the page could be built. Reloading is worth trying; if it keeps
            happening the problem is on our side and we are the ones who need to fix it.
          </p>
          <p style={{ marginTop: "1.75rem" }}>
            {/*
              A plain anchor, not next/link. This boundary catches a failure in
              the root layout, so the router itself may be part of what broke —
              a client-side navigation would be attempting to use the machinery
              that just threw. A full document load is the only reliable escape.
            */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                display: "inline-block",
                padding: "0.625rem 1.25rem",
                borderRadius: "0.5rem",
                background: "#17335c",
                color: "#ffffff",
                textDecoration: "none",
                fontWeight: 500,
                fontSize: "0.9375rem",
              }}
            >
              Reload Locora
            </a>
          </p>
          {error.digest ? (
            <p style={{ marginTop: "2rem", fontSize: "0.75rem", color: "#7b8598" }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
