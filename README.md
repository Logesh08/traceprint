# Traceprint

Traceprint is a cross-layer A/B fingerprint comparison laboratory. It creates two capability-protected browser capture links, records JavaScript-visible environment and automation evidence, accepts tls.peet.ws reports, and explains differences across browser, CDP, TLS, HTTP/2, rendering and consistency layers.

## What the first release includes

- Anonymous 24-hour sessions with independent Client A and Client B capture links
- Owner and capture tokens kept in URL fragments so they are not sent during navigation
- Early synchronous CDP probe that runs before React
- Controlled Error stack/name serialization observations
- A DevTools timing discriminator kept separate from stronger WebDriver evidence
- WebDriver, ChromeDriver, Playwright and other known automation markers
- Navigator descriptor-integrity checks
- Main-window and dedicated-worker identity capture
- Canvas, WebGL, audio, font, screen, hardware, locale and feature probes
- Imported Peet TLS, JA3, JA4 and HTTP/2 evidence
- Field-level A/B diff, automation comparison, consistency findings and JSON export

Traceprint treats each signal as evidence. Error serialization can be caused by open DevTools, while automation clients can avoid it by not enabling the relevant CDP domains.

## Stack

- React, Vite and TypeScript
- Cloudflare Pages and Pages Functions
- Cloudflare D1
- Vitest
- Custom CSS inspired by the compact dark-laboratory styling of ShieldFont Decoder

## Local frontend

Install packages with npm install, then run npm run dev.

## Full local Pages environment

Run npm run pages:dev. Wrangler supplies a persistent local D1 binding and Traceprint initializes its schema when the first session is created.

## Cloudflare Pages deployment

1. Create a D1 database named traceprint.
2. Apply migrations/0001_initial.sql to it.
3. Create a Cloudflare Pages project connected to this repository.
4. Use npm run build as the build command and dist as the output directory.
5. Add a D1 binding named DB to the Pages project.

The free hosted edition imports transport reports because Cloudflare terminates the original TLS connection before Pages Functions can inspect the raw ClientHello.

## Research acknowledgement

The Runtime/CDP work is informed by the public MIT-licensed Brotector project. Traceprint uses its own non-destructive implementation and preserves ambiguity between DevTools and automation where the evidence does not justify a stronger conclusion.

## License

MIT
