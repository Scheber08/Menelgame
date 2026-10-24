// wrangler erwartet den Asset-Ordner der Web-App; im Dev-Modus liefert Vite die Seiten aus.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const dir = new URL('../../web/dist/', import.meta.url);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('index.html', dir), '<!doctype html><title>Menelgame</title>');
}
