import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
// grab the i18n object literal: const i18n = { ... }; (up to the matching close before contactDefaults)
const m = html.match(/const\s+i18n\s*=\s*(\{[\s\S]*?\});\s*\n\s*const\s+contactDefaults/);
if(!m){ console.error('i18n not found'); process.exit(1); }
let obj;
try { obj = eval('(' + m[1] + ')'); }
catch(e){ console.error('eval failed', e.message); process.exit(1); }
fs.writeFileSync(process.argv[2], JSON.stringify(obj));
console.error('langs:', Object.keys(obj).join(','), '| keys per lang:', Object.keys(obj.en).length);
