const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = 3003;

// ── Credentials ───────────────────────────────────────────────────────────────
const AUTH_USER = process.env.HMS_USER || 'REDACTED';
const AUTH_PASS = process.env.HMS_PASS || 'REDACTED';

// ── Serper API Key ────────────────────────────────────────────────────────────
const SERPER_API_KEY = process.env.SERPER_API_KEY || '';

// ── Sessions ──────────────────────────────────────────────────────────────────
const sessions = new Map();
function makeToken() { return crypto.randomBytes(32).toString('hex'); }
function isAuthenticated(req) {
  const token = req.cookies?.hms_session;
  return token && sessions.has(token);
}

// ── Cookie parser ─────────────────────────────────────────────────────────────
function parseCookies(req, res, next) {
  const raw = req.headers.cookie || '';
  req.cookies = {};
  raw.split(';').forEach(part => {
    const [k, ...v] = part.trim().split('=');
    if (k) req.cookies[k.trim()] = decodeURIComponent(v.join('='));
  });
  next();
}

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'inventory.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS assets (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    category          TEXT NOT NULL DEFAULT 'audio',
    subcategory       TEXT NOT NULL DEFAULT '',
    quantity          INTEGER NOT NULL DEFAULT 1,
    quantity_available INTEGER NOT NULL DEFAULT 1,
    replacement_value REAL NOT NULL DEFAULT 0,
    purchase_cost     REAL NOT NULL DEFAULT 0,
    purchase_date     TEXT DEFAULT '',
    condition         TEXT NOT NULL DEFAULT 'good',
    location          TEXT DEFAULT '',
    notes             TEXT DEFAULT '',
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS activity_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id   INTEGER,
    action     TEXT NOT NULL,
    detail     TEXT DEFAULT '',
    qty_change REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS price_checks (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id       INTEGER NOT NULL,
    asset_name     TEXT NOT NULL,
    current_value  REAL NOT NULL DEFAULT 0,
    proposed_value REAL,
    source_url     TEXT DEFAULT '',
    source_name    TEXT DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'pending',
    batch_id       TEXT NOT NULL,
    checked_at     TEXT DEFAULT (datetime('now')),
    resolved_at    TEXT,
    FOREIGN KEY (asset_id) REFERENCES assets(id)
  );
`);

// ── Taxonomy ──────────────────────────────────────────────────────────────────
const TAXONOMY = {
  audio: {
    label: 'Audio Equipment', icon: '🎙',
    subs: {
      microphones:       'Microphones',
      speakers:          'Speakers',
      mixers:            'Mixers / Consoles',
      signal_processors: 'Signal Processors',
      recorders:         'Recorders'
    }
  },
  video_display: {
    label: 'Video Equipment', icon: '📺',
    subs: {
      projectors:       'Projectors',
      screens:          'Projection Screens',
      displays:         'Displays & Monitors',
      mounting:         'Mounting / Rigging',
      switchers:        'Switchers',
      converters:       'Converters'
    }
  },
  video_production: {
    label: 'Video Production', icon: '🎬',
    subs: {
      video_cameras:  'Video Cameras',
      misc_acc:       'MISC / Accessories',
      tripods:        'Tripods',
      lenses:         'Lenses',
      video_recorders:'Video Recorders',
      monitors:       'Monitors',
      ssd_storage:    'SSD / Storage',
      batteries_power:'Batteries / Power',
      rigging:        'Rigging'
    }
  },
  lighting: {
    label: 'Lighting Equipment', icon: '💡',
    subs: {
      fixtures:   'Fixtures',
      control:    'Control & Rigging',
      modifiers:  'Modifiers'
    }
  },
  livestreaming: {
    label: 'Livestreaming', icon: '📡',
    subs: {
      encoders:  'Encoders & Streaming Devices',
      capture:   'Capture Cards',
      graphics:  'Graphics & Overlays'
    }
  },
  photo: {
    label: 'Photo', icon: '📷',
    subs: {
      cameras:     'Cameras',
      lenses:      'Lenses',
      support:     'Support & Grip',
      camera_acc:  'Camera Accessories',
      filters:     'Filters'
    }
  },
  staging: {
    label: 'Staging & Support', icon: '🏗',
    subs: {
      staging:    'Staging',
      trussing:   'Trussing & Rigging',
      pipe_drape: 'Pipe & Drape'
    }
  },
  computing: {
    label: 'Computing & IT', icon: '💻',
    subs: {
      playback:    'Playback Systems',
      display_io:  'Display I/O',
      networking:  'Networking'
    }
  },
  cables: {
    label: 'Cables & Connectors', icon: '🔌',
    subs: {
      video:      'Video',
      audio:      'Audio',
      lighting:   'Lighting',
      computer:   'Computer',
      ac_power:   'AC Power',
      data_power: 'Data / Power',
      adapters:   'Adapters'
    }
  },
  accessories: {
    label: 'Accessories / Peripherals', icon: '🔧',
    subs: {
      chargers: 'Chargers'
    }
  },
  consumables: {
    label: 'Consumables & Accessories', icon: '🧰',
    subs: {
      tape:      'Tape',
      batteries: 'Batteries',
      hardware:  'Hardware & Adapters'
    }
  },
  transport: {
    label: 'Transport & Storage', icon: '🚛',
    subs: {
      cases: 'Road Cases',
      bags:  'Bags',
      carts: 'AV Carts'
    }
  }
};

const CONDITIONS = { excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Poor — Needs Service' };

app.use(express.json());
app.use(parseCookies);

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === AUTH_USER && password === AUTH_PASS) {
    const token = makeToken();
    sessions.set(token, { user: username, created: Date.now() });
    res.setHeader('Set-Cookie', `hms_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/logout', (req, res) => {
  const token = req.cookies?.hms_session;
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'hms_session=; Path=/; HttpOnly; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/check-auth', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

// ── Auth middleware ───────────────────────────────────────────────────────────
app.use('/api', (req, res, next) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

app.use(express.static(__dirname));

// ── API ───────────────────────────────────────────────────────────────────────
app.get('/api/taxonomy', (req, res) => res.json(TAXONOMY));

app.get('/api/assets', (req, res) => {
  res.json(db.prepare('SELECT * FROM assets ORDER BY category, subcategory, LOWER(name)').all());
});

app.post('/api/assets', (req, res) => {
  const { name, category, subcategory, quantity, quantity_available,
          replacement_value, purchase_cost, purchase_date, condition, location, notes } = req.body;

  if (!name?.trim())       return res.status(400).json({ error: 'name required' });
  if (!TAXONOMY[category]) return res.status(400).json({ error: 'invalid category' });

  const qty   = parseInt(quantity) || 1;
  const avail = parseInt(quantity_available ?? qty);

  const r = db.prepare(`
    INSERT INTO assets
      (name, category, subcategory, quantity, quantity_available,
       replacement_value, purchase_cost, purchase_date, condition, location, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(name.trim(), category, subcategory||'', qty, avail,
         parseFloat(replacement_value)||0, parseFloat(purchase_cost)||0,
         purchase_date||'', CONDITIONS[condition] ? condition : 'good', location||'', notes||'');

  db.prepare("INSERT INTO activity_log (asset_id,action,detail,qty_change) VALUES (?,'added',?,?)")
    .run(r.lastInsertRowid, `Added: ${name.trim()}`, qty);

  res.json(db.prepare('SELECT * FROM assets WHERE id=?').get(r.lastInsertRowid));
});

app.patch('/api/assets/:id', (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id=?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Not found' });

  const allowed = ['name','category','subcategory','quantity','quantity_available',
                   'replacement_value','purchase_cost','purchase_date','condition','location','notes'];
  const updates = [], vals = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) { updates.push(`${k}=?`); vals.push(req.body[k]); }
  }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  updates.push("updated_at=datetime('now')");
  vals.push(req.params.id);
  db.prepare(`UPDATE assets SET ${updates.join(',')} WHERE id=?`).run(...vals);

  if (req.body.quantity !== undefined && req.body.quantity !== asset.quantity) {
    db.prepare("INSERT INTO activity_log (asset_id,action,detail,qty_change) VALUES (?,'qty_update',?,?)")
      .run(req.params.id, `Qty ${asset.quantity}→${req.body.quantity}`, req.body.quantity - asset.quantity);
  }
  if (req.body.condition !== undefined && req.body.condition !== asset.condition) {
    db.prepare("INSERT INTO activity_log (asset_id,action,detail) VALUES (?,'condition_update',?)")
      .run(req.params.id, `Condition: ${asset.condition}→${req.body.condition}`);
  }

  res.json(db.prepare('SELECT * FROM assets WHERE id=?').get(req.params.id));
});

app.delete('/api/assets/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM assets WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM price_checks WHERE asset_id=?').run(req.params.id);
  db.prepare('DELETE FROM assets WHERE id=?').run(req.params.id);
  db.prepare("INSERT INTO activity_log (asset_id,action,detail) VALUES (?,'deleted',?)").run(req.params.id, a.name);
  res.json({ ok: true });
});

app.get('/api/stats', (req, res) => {
  const totalItems       = db.prepare('SELECT COUNT(*) c FROM assets').get().c;
  const totalUnits       = db.prepare('SELECT SUM(quantity) s FROM assets').get().s || 0;
  const totalReplacement = db.prepare('SELECT SUM(quantity*replacement_value) s FROM assets').get().s || 0;
  const totalCost        = db.prepare('SELECT SUM(quantity*purchase_cost) s FROM assets').get().s || 0;
  const needsService     = db.prepare("SELECT COUNT(*) c FROM assets WHERE condition='poor'").get().c;
  const byCategory = db.prepare(`
    SELECT category, COUNT(*) as items, SUM(quantity) as units, SUM(quantity*replacement_value) as replacement
    FROM assets GROUP BY category ORDER BY replacement DESC
  `).all();
  const byCondition = db.prepare('SELECT condition, COUNT(*) as count FROM assets GROUP BY condition').all();
  res.json({ totalItems, totalUnits, totalReplacement, totalCost, needsService, byCategory, byCondition });
});

app.get('/api/activity', (req, res) => {
  res.json(db.prepare(`
    SELECT l.*, a.name asset_name
    FROM activity_log l LEFT JOIN assets a ON a.id=l.asset_id
    ORDER BY l.created_at DESC LIMIT 100
  `).all());
});

app.get('/api/export', (req, res) => {
  const rows = [['Name','Category','Subcategory','Qty',
                 'Unit Cost','Total Cost','Replacement Value','Total Replacement',
                 'Purchase Date','Condition','Location','Notes','Date Added']];
  for (const a of db.prepare('SELECT * FROM assets ORDER BY category,subcategory,LOWER(name)').all()) {
    const cat = TAXONOMY[a.category];
    rows.push([
      a.name,
      cat?.label||a.category, cat?.subs[a.subcategory]||a.subcategory,
      a.quantity,
      a.purchase_cost.toFixed(2), (a.quantity*a.purchase_cost).toFixed(2),
      a.replacement_value.toFixed(2), (a.quantity*a.replacement_value).toFixed(2),
      a.purchase_date, CONDITIONS[a.condition]||a.condition,
      a.location, a.notes, a.created_at
    ]);
  }
  const csv = rows.map(r=>r.map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition',`attachment; filename="hms-inventory-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csv);
});

// ── B&H Price Check (Serper.dev) ─────────────────────────────────────────────

function serperSearch(query, type = 'search') {
  if (!SERPER_API_KEY) {
    return Promise.reject(new Error('SERPER_API_KEY not set'));
  }

  const postData = JSON.stringify({ q: query, num: 10 });
  const searchPath = type === 'shopping' ? '/shopping' : '/search';

  return new Promise((resolve, reject) => {
    const req = require('https').request({
      hostname: 'google.serper.dev',
      path: searchPath,
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse Serper response')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Serper request timed out')); });
    req.write(postData);
    req.end();
  });
}

async function searchBHPrice(query) {
  try {
    const qWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    // Step 1: Google Shopping for price
    const shopResult = await serperSearch(query, 'shopping');
    const shopItems = (shopResult.shopping || []);

    let bestShopItem = null;
    let bestShopScore = -1;

    for (const item of shopItems) {
      const price = parseFloat(String(item.price || '').replace(/[$,]/g, '')) || 0;
      if (price <= 0) continue;

      const nameLower = (item.title || '').toLowerCase();
      const wordScore = qWords.filter(w => nameLower.includes(w)).length;
      const isBH = (item.source || '').toLowerCase().includes('b&h') ||
                    (item.source || '').toLowerCase().includes('bhphoto') ||
                    (item.link || '').includes('bhphotovideo.com');
      const score = wordScore + (isBH ? 5 : 0);

      if (score > bestShopScore) {
        bestShopScore = score;
        bestShopItem = {
          name: item.title || '',
          price: price,
          url: item.link || '',
          priceText: '$' + price.toFixed(2),
          source: item.source || 'Google Shopping'
        };
      }
    }

    // Step 2: B&H site search for product page link
    let bhProductUrl = '';
    let bhProductName = '';

    const bhResult = await serperSearch('site:bhphotovideo.com/c/product ' + query);
    const bhOrganic = (bhResult.organic || []);

    for (const item of bhOrganic) {
      const link = item.link || '';
      if (link.includes('bhphotovideo.com/c/product/')) {
        const nameLower = (item.title || '').toLowerCase();
        const wordScore = qWords.filter(w => nameLower.includes(w)).length;
        if (wordScore >= 1 || !bhProductUrl) {
          bhProductUrl = link;
          bhProductName = (item.title || '')
            .replace(/\s*\|?\s*B&H\s*Photo.*$/i, '')
            .replace(/\s*-\s*B&H\s*Photo.*$/i, '')
            .trim();
          if (wordScore >= 2) break;
        }
      }
    }

    // Step 3: Check if organic results have a price
    let organicItem = null;
    for (const item of bhOrganic) {
      let price = 0;
      if (item.price) {
        price = parseFloat(String(item.price).replace(/[$,]/g, '')) || 0;
      }
      if (!price && item.snippet) {
        const m = item.snippet.match(/\$([\d,]+\.\d{2})/);
        if (m) price = parseFloat(m[1].replace(/,/g, '')) || 0;
      }
      if (price > 0 && !organicItem) {
        organicItem = {
          name: (item.title || '').replace(/\s*\|?\s*B&H.*$/i, '').trim(),
          price: price,
          url: item.link || '',
          priceText: '$' + price.toFixed(2),
          source: 'B&H Photo'
        };
      }
    }

    // Step 4: Pick the best result
    let bestMatch = null;

    if (organicItem && organicItem.price > 0) {
      bestMatch = organicItem;
      if (bhProductUrl) bestMatch.url = bhProductUrl;
    } else if (bestShopItem) {
      bestMatch = bestShopItem;
    }

    if (bestMatch && bestMatch.price > 0) {
      const finalUrl = bhProductUrl || bestMatch.url;
      return {
        found: true,
        bestMatch: {
          name: bestMatch.name,
          price: bestMatch.price,
          url: finalUrl,
          priceText: bestMatch.priceText,
          source: bestMatch.source || 'B&H Photo'
        },
        allResults: [bestMatch],
        matchScore: 1,
        queryWords: qWords.length
      };
    }

    return {
      found: false,
      bestMatch: bhProductUrl ? { name: bhProductName, price: 0, url: bhProductUrl, source: 'B&H Photo' } : null,
      error: 'No price found'
    };

  } catch (e) {
    return { found: false, error: e.message };
  }
}

// ── Price Check Routes ───────────────────────────────────────────────────────

app.post('/api/price-check/start', async (req, res) => {
  const batchId = 'pc_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
  const assets = db.prepare('SELECT id, name, replacement_value FROM assets ORDER BY category, name').all();
  if (!assets.length) return res.status(400).json({ error: 'No assets in inventory' });
  db.prepare("DELETE FROM price_checks WHERE status IN ('pending','pending_retry')").run();
  const insert = db.prepare(`INSERT INTO price_checks (asset_id, asset_name, current_value, status, batch_id) VALUES (?, ?, ?, 'pending', ?)`);
  const tx = db.transaction(() => { for (const a of assets) { insert.run(a.id, a.name, a.replacement_value, batchId); } });
  tx();
  res.json({ batchId, totalItems: assets.length });
});

app.post('/api/price-check/process-next', async (req, res) => {
  const next = db.prepare("SELECT * FROM price_checks WHERE status IN ('pending','pending_retry') ORDER BY id LIMIT 1").get();
  if (!next) return res.json({ done: true });

  try {
    const result = await searchBHPrice(next.asset_name);

    if (result.found && result.bestMatch.price > 0) {
      const sourceName = result.bestMatch.source
        ? result.bestMatch.name + ' (' + result.bestMatch.source + ')'
        : result.bestMatch.name;
      db.prepare(`UPDATE price_checks SET proposed_value = ?, source_url = ?, source_name = ?, status = 'found', checked_at = datetime('now') WHERE id = ?`)
        .run(result.bestMatch.price, result.bestMatch.url, sourceName, next.id);
    } else {
      db.prepare(`UPDATE price_checks SET status = 'not_found', checked_at = datetime('now') WHERE id = ?`).run(next.id);
    }

    const remaining = db.prepare("SELECT COUNT(*) c FROM price_checks WHERE status IN ('pending','pending_retry')").get().c;
    const total = db.prepare("SELECT COUNT(*) c FROM price_checks WHERE batch_id = ?").get(next.batch_id).c;
    res.json({ done: false, processed: next.asset_name, found: result.found, price: result.found ? result.bestMatch?.price : null, remaining, total, progress: Math.round(((total - remaining) / total) * 100) });
  } catch (e) {
    db.prepare("UPDATE price_checks SET status = 'error', checked_at = datetime('now') WHERE id = ?").run(next.id);
    const remaining = db.prepare("SELECT COUNT(*) c FROM price_checks WHERE status IN ('pending','pending_retry')").get().c;
    const total = db.prepare("SELECT COUNT(*) c FROM price_checks WHERE batch_id = ?").get(next.batch_id).c;
    res.json({ done: false, processed: next.asset_name, found: false, error: e.message, remaining, total, progress: Math.round(((total - remaining) / total) * 100) });
  }
});

app.get('/api/price-check/results', (req, res) => {
  const results = db.prepare(`
    SELECT pc.*, a.category, a.replacement_value as live_value
    FROM price_checks pc LEFT JOIN assets a ON a.id = pc.asset_id
    WHERE pc.status IN ('found', 'not_found', 'error')
    ORDER BY CASE pc.status WHEN 'found' THEN 0 WHEN 'not_found' THEN 1 ELSE 2 END, ABS(pc.proposed_value - pc.current_value) DESC
  `).all();
  const stats = {
    total: results.length,
    found: results.filter(r => r.status === 'found').length,
    notFound: results.filter(r => r.status === 'not_found').length,
    errors: results.filter(r => r.status === 'error').length,
    pending: db.prepare("SELECT COUNT(*) c FROM price_checks WHERE status IN ('pending','pending_retry')").get().c
  };
  res.json({ results, stats });
});

app.post('/api/price-check/approve/:id', (req, res) => {
  const pc = db.prepare('SELECT * FROM price_checks WHERE id = ?').get(req.params.id);
  if (!pc) return res.status(404).json({ error: 'Not found' });
  if (pc.status !== 'found') return res.status(400).json({ error: 'No price to approve' });
  db.prepare("UPDATE assets SET replacement_value = ?, updated_at = datetime('now') WHERE id = ?").run(pc.proposed_value, pc.asset_id);
  db.prepare("INSERT INTO activity_log (asset_id, action, detail) VALUES (?, 'condition_update', ?)").run(pc.asset_id, `Replacement value updated: $${pc.current_value.toFixed(2)} → $${pc.proposed_value.toFixed(2)} (price check)`);
  db.prepare("UPDATE price_checks SET status = 'approved', resolved_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/price-check/dismiss/:id', (req, res) => {
  db.prepare("UPDATE price_checks SET status = 'dismissed', resolved_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/price-check/approve-all', (req, res) => {
  const found = db.prepare("SELECT * FROM price_checks WHERE status = 'found'").all();
  const tx = db.transaction(() => {
    for (const pc of found) {
      db.prepare("UPDATE assets SET replacement_value = ?, updated_at = datetime('now') WHERE id = ?").run(pc.proposed_value, pc.asset_id);
      db.prepare("INSERT INTO activity_log (asset_id, action, detail) VALUES (?, 'condition_update', ?)").run(pc.asset_id, `Replacement value: $${pc.current_value.toFixed(2)} → $${pc.proposed_value.toFixed(2)} (bulk price check)`);
      db.prepare("UPDATE price_checks SET status = 'approved', resolved_at = datetime('now') WHERE id = ?").run(pc.id);
    }
  });
  tx();
  res.json({ ok: true, approved: found.length });
});

app.patch('/api/price-check/:id', (req, res) => {
  const { proposed_value } = req.body;
  if (proposed_value === undefined) return res.status(400).json({ error: 'proposed_value required' });
  db.prepare("UPDATE price_checks SET proposed_value = ? WHERE id = ?").run(parseFloat(proposed_value), req.params.id);
  res.json({ ok: true });
});

app.post('/api/price-check/retry-not-found', (req, res) => {
  const count = db.prepare("SELECT COUNT(*) c FROM price_checks WHERE status = 'not_found'").get().c;
  if (!count) return res.json({ count: 0 });
  db.prepare("UPDATE price_checks SET status = 'pending_retry' WHERE status = 'not_found'").run();
  res.json({ count });
});

app.get('/price-check', (req, res) => {
  if (!isAuthenticated(req)) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'price-check.html'));
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`HMS Inventory on port ${PORT}`));
