const fs = require('node:fs');

const DEMO_URL = 'https://greylad-pharmacy-demo.vercel.app/';
const patch = fs.readFileSync('branch-demo.js', 'utf8');

async function main() {
  const response = await fetch(DEMO_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not retrieve the existing demo (' + response.status + ')');

  let original = await response.text();
  if (!original.includes('retail-pharmacy-demo-v1') ||
      !original.includes('data-tab="checkout"') ||
      !original.includes('data-tab="patients"')) {
    throw new Error('The current demo does not match the expected pharmacy application. Build stopped to protect it.');
  }

  let removedLayers = 0;
  let rebuilt = '';
  let cursor = 0;
  while (true) {
    const open = original.indexOf('<script', cursor);
    if (open < 0) break;
    const close = original.indexOf('</script>', open);
    if (close < 0) break;
    const after = close + '</script>'.length;
    const tag = original.slice(open, after);
    if (tag.includes('demo-branch-switch') && tag.includes('demoOverview')) {
      rebuilt += original.slice(cursor, open);
      removedLayers++;
    } else {
      rebuilt += original.slice(cursor, after);
    }
    cursor = after;
  }
  rebuilt += original.slice(cursor);
  original = rebuilt;
  if (!removedLayers) throw new Error('Could not locate the existing demo branch layer. Build stopped to protect it.');

  const marker = '</body></html>';
  if (!original.includes(marker)) throw new Error('Demo closing markup not found.');
  const html = original.replace(marker, '<script>' + patch.replace(/<\/script/gi, '<\\/script') + '</script>' + marker);

  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/index.html', html);
  fs.writeFileSync('dist/robots.txt', 'User-agent: *\nDisallow: /\n');
  fs.writeFileSync('dist/vercel.json', JSON.stringify({
    headers: [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' }
    ] }]
  }));

  const checks = {
    singleBranchSelector: (html.match(/id="demo-branch-switch"/g) || []).length === 2,
    branchLayer: html.includes('demoOverview'),
    businessCustomerTab: html.includes('Business customers'),
    wholesalePriceTab: html.includes('Wholesale prices'),
    originalCheckout: html.includes('data-tab="checkout"'),
    originalPatientRecords: html.includes('data-tab="patients"')
  };
  if (Object.values(checks).some(value => !value)) throw new Error('Demo build validation failed: ' + JSON.stringify(checks));
  console.log('Demo rebuilt from existing pharmacy app:', html.length, 'characters', JSON.stringify(checks));
}

main().catch(error => { console.error(error); process.exit(1); });
