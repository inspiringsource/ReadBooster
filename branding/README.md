# ReadBooster branding sources

`website-favicon/` retains the original website-oriented favicon bundle and the 512×512 source artwork. It is not part of the Chrome extension runtime package and is reserved for a possible future ReadBooster website.

The extension icons in `public/icons/` are generated from `website-favicon/web-app-manifest-512x512.png`. The 16×16 and 32×32 variants use a simplified bookmark/arrow mark for clarity; the 48×48 and 128×128 variants retain the full document artwork.

When replacing the artwork, start with a square high-resolution source, preserve transparent safe padding, regenerate every declared PNG at its exact size, inspect 16×16 and 32×32 separately, then rebuild and verify every path in `dist/manifest.json`.
