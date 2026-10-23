// Phase 12: installability basics - the manifest, its icons, and the links in index.html.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const clientFile = (path) => new URL(`../${path}`, import.meta.url);
const manifest = JSON.parse(readFileSync(clientFile('public/manifest.webmanifest'), 'utf8'));

/** Width/height from a PNG's IHDR chunk. */
function pngSize(path) {
  const data = readFileSync(clientFile(`public${path}`));
  assert.equal(data.subarray(1, 4).toString('latin1'), 'PNG', `${path} is not a PNG`);
  return `${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`;
}

describe('web app manifest', () => {
  it('has the fields browsers need to install the app', () => {
    assert.equal(manifest.name, 'Little Einstein Discovery School');
    assert.ok(manifest.short_name);
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.display, 'standalone');
    assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
    assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  });

  it('lists 192px, 512px and maskable 512px PNG icons whose files have those sizes', () => {
    const find = (sizes, purpose) => manifest.icons.find((icon) => icon.sizes === sizes && icon.purpose === purpose);
    for (const [sizes, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]) {
      const icon = find(sizes, purpose);
      assert.ok(icon, `${sizes} ${purpose} icon missing`);
      assert.equal(icon.type, 'image/png');
      assert.equal(pngSize(icon.src), sizes);
    }
    assert.equal(pngSize('/icons/apple-touch-icon.png'), '180x180');
  });

  it('is linked from index.html with the Apple touch icon and theme colour', () => {
    const html = readFileSync(clientFile('index.html'), 'utf8');
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"/);
    assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/);
    assert.match(html, new RegExp(`<meta name="theme-color" content="${manifest.theme_color}"`));
  });
});
