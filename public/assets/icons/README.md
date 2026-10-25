# UI icons

Lucide static 1.61.0, downloaded from the npm registry (official lucide-static package). Original SVG files live in `lucide/`; the full ISC/Feather MIT notices are in `LICENSE`. Source version, registry tarball and SHA-512 integrity are recorded in `manifest.json`; the downloaded tarball was checked against that integrity value.

The website uses a local SVG symbol sheet (`lucide.svg`), not a runtime CDN or an icon font. `src/icons.js` renders accessible decorative SVGs server-side; generated `public/icons.js` provides the same renderer for AJAX and dynamic controls. All UI icons use a 24px grid, rounded caps/joins, currentColor and a common 1.8px stroke.

To add an icon: copy its original SVG from the pinned package into `lucide/`, add its name to the manifest, then run `node scripts/build-icons.js`. The script regenerates the sprite and browser helper. Use `uiIcon(name, {size, className})` in server templates and `window.yoruIcons.svg(...)` in client scripts. For toggles, `window.yoruIcons.set(svg, name)` keeps the SVG node and its focus/state hooks intact.

The reusable glyphs cover navigation, account menus, chat, comments, notifications, profile controls, streaks, ratings and player controls. The favicon, brand artwork, user-provided content and achievement illustrations are separate assets.

Source: https://github.com/lucide-icons/lucide · https://lucide.dev/license
