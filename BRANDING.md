# Khelastrix branding integration

## Files created (public/)
- `brand/Khelastrix_Animated_Logo.svg` — official logo, byte-for-byte unchanged
- `brand/logo-512.jpg` — static fallback (from the supplied Logo_Preview.png, composited on navy)
- `brand/favicon-16.png`, `favicon-32.png`, `favicon-48.png`, `/favicon.ico` — simplified favicon (crown + trophy crop of the official art; readable when tiny)
- `brand/apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` — mobile/app icons
- `brand/og-image.jpg` — 1200x630 social preview
- `manifest.webmanifest` — installable-app metadata (name, icons, navy theme)

## Files modified
- `public/user.html`, `public/admin.html` — branding/UI only (head metadata, logo mounts, loading screen, brand theme CSS). Firebase config, database rules, Cloud Functions and all business logic are untouched.
- `public/index.html` — branded redirect page; `firebase.json` — one added cache header for `/brand/**`.

## How the logo is used
The official SVG is embedded unchanged as a data URI and rendered through `<img>` (header, loading screen, login screens). Its own CSS animations (pulse/glow, trophy float, light sweep, orbit, twinkle) run exactly as designed and its built-in `prefers-reduced-motion` rule is respected. No animation is re-created in the page, so nothing conflicts. If the SVG cannot render, the page falls back to `brand/logo-512.jpg`.
- Header: 48px (56px on tablet/desktop, 42px on very small phones), with the KHELASTRIX wordmark text beside it as real text for readability/accessibility.
- Loading screen: navy radial background, purple + gold halo (pulses softly, off under reduced motion), large logo, gradient progress bar, "POWERED BY KHELASTRIX" and "PREPARING YOUR ARENA...". It finishes in well under a second once the page is ready (no artificial wait).

## Colors
Gold #FFD33D (join buttons, active nav, highlights) · Deep Purple #702BFF and Neon #E04CFF (primary buttons, tabs, links) · Navy #07091B / #0D102B (backgrounds, cards) · Silver #C5CEDF (wordmark, muted text). Glow is limited to the logo, wallet card and loading screen.

## Notes
- Social-preview URLs point to https://ludofire-arena.web.app/brand/og-image.jpg. If you use another domain, change it in the `og:` / `twitter:` meta tags in `user.html`.
- The supplied PNG and SVG are different artworks (the PNG has a crown, the SVG does not). The SVG is used as primary, as requested; the favicon/app icons and fallback come from the PNG.
