const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = 3003;

// ── Credentials ───────────────────────────────────────────────────────────────
const AUTH_USER = process.env.HMS_USER || 'highland';
const AUTH_PASS = process.env.HMS_PASS || 'changeme';

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
  const rows = [['Name','Category','Subcategory','Total Qty','Available Qty',
                 'Replacement Value','Total Replacement','Purchase Cost','Total Cost',
                 'Purchase Date','Condition','Location','Notes','Date Added']];
  for (const a of db.prepare('SELECT * FROM assets ORDER BY category,subcategory,LOWER(name)').all()) {
    const cat = TAXONOMY[a.category];
    rows.push([
      a.name,
      cat?.label||a.category, cat?.subs[a.subcategory]||a.subcategory,
      a.quantity, a.quantity_available,
      a.replacement_value.toFixed(2), (a.quantity*a.replacement_value).toFixed(2),
      a.purchase_cost.toFixed(2), (a.quantity*a.purchase_cost).toFixed(2),
      a.purchase_date, CONDITIONS[a.condition]||a.condition,
      a.location, a.notes, a.created_at
    ]);
  }
  const csv = rows.map(r=>r.map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition',`attachment; filename="hms-inventory-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csv);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`HMS Inventory on port ${PORT}`));
