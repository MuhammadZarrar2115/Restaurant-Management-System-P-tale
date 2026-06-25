const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const multer = require('multer');

const app = express();
const PORT = 3001;
const JWT_SECRET = 'tabletop_secret_key_2024';
const DB_PATH = path.join(__dirname, 'tabletop.db');
const IMAGES_DIR = path.join(__dirname, 'images');

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

// ─── Multer config ────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, unique);
  }
});

const ALLOWED_MIMETYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, JPEG, PNG, and WEBP images are allowed.'));
    }
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve uploaded images from /images path
app.use('/images', express.static(IMAGES_DIR));

// ─── Password helpers ─────────────────────────────────────────────
const hashPassword = (p) => crypto.createHash('sha256').update(p + 'tt_salt_2024').digest('hex');
const comparePassword = (plain, hash) => hashPassword(plain) === hash;

// ─── DB wrapper ───────────────────────────────────────────────────
let db;

function saveToDisk() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function run(sql, params = []) {
  db.run(sql, params);
  saveToDisk();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function runGetId(sql, params = []) {
  db.run(sql, params);
  const row = get('SELECT last_insert_rowid() as id');
  saveToDisk();
  return row.id;
}

// ─── Image cleanup helper ─────────────────────────────────────────
function deleteImageFile(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('/images/')) return;
  const filename = path.basename(imageUrl);
  const filepath = path.join(IMAGES_DIR, filename);
  try {
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch (e) {
    console.error('Failed to delete image:', filepath, e.message);
  }
}

// ─── Init DB ──────────────────────────────────────────────────────
async function initDB() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT ''
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    price REAL NOT NULL,
    description TEXT DEFAULT '',
    spicy_level TEXT DEFAULT 'None',
    is_available INTEGER DEFAULT 1,
    offer TEXT DEFAULT '',
    image_url TEXT DEFAULT ''
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_number INTEGER UNIQUE NOT NULL,
    status TEXT DEFAULT 'available'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    table_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    total_amount REAL DEFAULT 0,
    payment_method TEXT DEFAULT '',
    payment_status TEXT DEFAULT 'unpaid',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    menu_item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    notes TEXT DEFAULT ''
  )`);
  saveToDisk();

  // Seed admin
  const admin = get('SELECT * FROM admins WHERE username = ?', ['Admin']);
  if (!admin) {
    run('INSERT INTO admins (username, password) VALUES (?, ?)', ['Admin', hashPassword('Admin123')]);
    console.log('✅ Admin seeded: Admin / Admin123');
  }

  // Seed categories
  const catCount = get('SELECT COUNT(*) as c FROM categories');
  if (!catCount || catCount.c == 0) {
    const cats = ['Starters', 'Main Course', 'Beverages', 'Desserts', 'Fast Food'];
    cats.forEach(c => run('INSERT INTO categories (name) VALUES (?)', [c]));

    const getCatId = (name) => get('SELECT id FROM categories WHERE name = ?', [name]).id;

    const items = [
      { name:'Spring Rolls', cat:'Starters', price:350, spicy:'Medium', desc:'Crispy fried rolls with veggie filling', offer:'' },
      { name:'Chicken Wings', cat:'Starters', price:550, spicy:'High', desc:'Spicy glazed wings', offer:'10% off' },
      { name:'Garlic Bread', cat:'Starters', price:250, spicy:'None', desc:'Toasted garlic butter bread', offer:'' },
      { name:'Grilled Chicken', cat:'Main Course', price:850, spicy:'Medium', desc:'Charcoal grilled chicken with herbs', offer:'' },
      { name:'Beef Burger', cat:'Main Course', price:750, spicy:'Medium', desc:'Juicy beef patty with fries', offer:'Combo deal' },
      { name:'Pasta Alfredo', cat:'Main Course', price:650, spicy:'None', desc:'Creamy white sauce pasta', offer:'' },
      { name:'Biryani', cat:'Main Course', price:700, spicy:'High', desc:'Aromatic rice with chicken', offer:'Best Seller' },
      { name:'Coca Cola', cat:'Beverages', price:150, spicy:'None', desc:'330ml can', offer:'' },
      { name:'Mango Shake', cat:'Beverages', price:280, spicy:'None', desc:'Fresh mango milkshake', offer:'' },
      { name:'Green Tea', cat:'Beverages', price:200, spicy:'None', desc:'Hot or iced green tea', offer:'' },
      { name:'Chocolate Lava Cake', cat:'Desserts', price:450, spicy:'None', desc:'Warm chocolate cake with molten center', offer:'' },
      { name:'Ice Cream Sundae', cat:'Desserts', price:350, spicy:'None', desc:'Vanilla ice cream with toppings', offer:'' },
      { name:'French Fries', cat:'Fast Food', price:250, spicy:'None', desc:'Crispy golden fries', offer:'' },
      { name:'Chicken Nuggets', cat:'Fast Food', price:450, spicy:'Medium', desc:'8 pieces crispy nuggets', offer:'' },
    ];
    items.forEach(i => {
      const catId = getCatId(i.cat);
      run('INSERT INTO menu_items (name, category_id, price, description, spicy_level, offer) VALUES (?,?,?,?,?,?)',
        [i.name, catId, i.price, i.desc, i.spicy, i.offer]);
    });
    console.log('✅ Menu seeded with', items.length, 'items');
  }

  // Seed tables
  const tblCount = get('SELECT COUNT(*) as c FROM tables');
  if (!tblCount || tblCount.c == 0) {
    for (let i = 1; i <= 10; i++) run('INSERT INTO tables (table_number) VALUES (?)', [i]);
    console.log('✅ 10 tables seeded');
  }
}

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── AUTH ─────────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const admin = get('SELECT * FROM admins WHERE username = ?', [username]);
  if (!admin || !comparePassword(password, admin.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, username: admin.username });
});

// ─── IMAGE UPLOAD ─────────────────────────────────────────────────
app.post('/api/upload/image', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided.' });
  const imageUrl = `/images/${req.file.filename}`;
  res.json({ image_url: imageUrl });
});

// Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Image file is too large. Maximum size is 5MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err && err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// ─── CATEGORIES ───────────────────────────────────────────────────
app.get('/api/categories', (req, res) => res.json(all('SELECT * FROM categories')));

app.post('/api/categories', authMiddleware, (req, res) => {
  const { name, description } = req.body;
  const id = runGetId('INSERT INTO categories (name, description) VALUES (?, ?)', [name, description || '']);
  res.json({ id, name, description });
});

app.put('/api/categories/:id', authMiddleware, (req, res) => {
  const { name, description } = req.body;
  run('UPDATE categories SET name=?, description=? WHERE id=?', [name, description || '', req.params.id]);
  res.json({ success: true });
});

app.delete('/api/categories/:id', authMiddleware, (req, res) => {
  run('DELETE FROM categories WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ─── MENU ─────────────────────────────────────────────────────────
app.get('/api/menu', (req, res) => {
  res.json(all(`SELECT m.*, c.name as category_name FROM menu_items m
    JOIN categories c ON m.category_id = c.id
    WHERE m.is_available = 1 ORDER BY c.name, m.name`));
});

app.get('/api/menu/all', authMiddleware, (req, res) => {
  res.json(all(`SELECT m.*, c.name as category_name FROM menu_items m
    JOIN categories c ON m.category_id = c.id ORDER BY c.name, m.name`));
});

app.post('/api/menu', authMiddleware, (req, res) => {
  const { name, category_id, price, description, spicy_level, offer, image_url } = req.body;
  const id = runGetId(
    'INSERT INTO menu_items (name, category_id, price, description, spicy_level, offer, image_url) VALUES (?,?,?,?,?,?,?)',
    [name, category_id, price, description || '', spicy_level || 'None', offer || '', image_url || '']
  );
  res.json({ id, ...req.body });
});

app.put('/api/menu/:id', authMiddleware, (req, res) => {
  const { name, category_id, price, description, spicy_level, offer, image_url, is_available } = req.body;

  // If a new image is provided that differs from the old one, delete the old local image
  const existing = get('SELECT image_url FROM menu_items WHERE id=?', [req.params.id]);
  if (existing && existing.image_url && image_url !== undefined && existing.image_url !== image_url) {
    deleteImageFile(existing.image_url);
  }

  run('UPDATE menu_items SET name=?, category_id=?, price=?, description=?, spicy_level=?, offer=?, image_url=?, is_available=? WHERE id=?',
    [name, category_id, price, description || '', spicy_level || 'None', offer || '',
     image_url !== undefined ? image_url : (existing ? existing.image_url : ''),
     is_available ?? 1, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/menu/:id', authMiddleware, (req, res) => {
  // Clean up image file before deleting record
  const item = get('SELECT image_url FROM menu_items WHERE id=?', [req.params.id]);
  if (item) deleteImageFile(item.image_url);
  run('DELETE FROM menu_items WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ─── TABLES ───────────────────────────────────────────────────────
app.get('/api/tables', (req, res) => res.json(all('SELECT * FROM tables ORDER BY table_number')));

app.get('/api/tables/all', authMiddleware, (req, res) => {
  const tables = all('SELECT * FROM tables ORDER BY table_number');
  tables.forEach(t => {
    const o = get(`SELECT id, total_amount, status FROM orders 
      WHERE table_id = ? AND status NOT IN ('completed','cancelled') LIMIT 1`, [t.id]);
    t.active_order_id = o?.id || null;
    t.total_amount = o?.total_amount || 0;
    t.order_status = o?.status || null;
  });
  res.json(tables);
});

// ─── ORDERS ───────────────────────────────────────────────────────
app.get('/api/orders', authMiddleware, (req, res) => {
  res.json(all(`SELECT o.*, t.table_number FROM orders o
    JOIN tables t ON o.table_id = t.id ORDER BY o.created_at DESC LIMIT 100`));
});

app.get('/api/orders/kitchen', (req, res) => {
  const orders = all(`SELECT o.*, t.table_number FROM orders o
    JOIN tables t ON o.table_id = t.id
    WHERE o.status IN ('pending','preparing') ORDER BY o.created_at ASC`);
  orders.forEach(o => {
    o.items = all(`SELECT oi.*, m.name as item_name FROM order_items oi
      JOIN menu_items m ON oi.menu_item_id = m.id WHERE oi.order_id = ?`, [o.id]);
  });
  res.json(orders);
});

app.get('/api/orders/table/:tableId', (req, res) => {
  const order = get(`SELECT * FROM orders WHERE table_id = ? AND status NOT IN ('completed','cancelled')
    ORDER BY created_at DESC LIMIT 1`, [req.params.tableId]);
  if (!order) return res.json(null);
  order.items = all(`SELECT oi.*, m.name as item_name, m.price FROM order_items oi
    JOIN menu_items m ON oi.menu_item_id = m.id WHERE oi.order_id = ?`, [order.id]);
  res.json(order);
});

app.get('/api/orders/:id', (req, res) => {
  const order = get(`SELECT o.*, t.table_number FROM orders o
    JOIN tables t ON o.table_id = t.id WHERE o.id = ?`, [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Not found' });
  order.items = all(`SELECT oi.*, m.name as item_name FROM order_items oi
    JOIN menu_items m ON oi.menu_item_id = m.id WHERE oi.order_id = ?`, [order.id]);
  res.json(order);
});

app.post('/api/orders', (req, res) => {
  const { table_id, items } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'No items' });

  const existing = get(`SELECT * FROM orders WHERE table_id = ? AND status NOT IN ('completed','cancelled')`, [table_id]);

  if (existing) {
    items.forEach(item => {
      const mi = get('SELECT price FROM menu_items WHERE id = ?', [item.menu_item_id]);
      const existingItem = get('SELECT * FROM order_items WHERE order_id = ? AND menu_item_id = ?', [existing.id, item.menu_item_id]);
      if (existingItem) {
        run('UPDATE order_items SET quantity = quantity + ? WHERE id = ?', [item.quantity, existingItem.id]);
      } else {
        run('INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, notes) VALUES (?,?,?,?,?)',
          [existing.id, item.menu_item_id, item.quantity, mi.price, item.notes || '']);
      }
    });
    const totalRow = get('SELECT SUM(quantity * unit_price) as t FROM order_items WHERE order_id = ?', [existing.id]);
    const newTotal = totalRow?.t || 0;
    run("UPDATE orders SET total_amount = ?, updated_at = datetime('now') WHERE id = ?", [newTotal, existing.id]);
    return res.json({ order_id: existing.id, total: newTotal });
  }

  let total = 0;
  items.forEach(item => {
    const mi = get('SELECT price FROM menu_items WHERE id = ?', [item.menu_item_id]);
    total += mi.price * item.quantity;
  });

  const orderId = uuidv4();
  run('INSERT INTO orders (id, table_id, total_amount) VALUES (?,?,?)', [orderId, table_id, total]);
  items.forEach(item => {
    const mi = get('SELECT price FROM menu_items WHERE id = ?', [item.menu_item_id]);
    run('INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, notes) VALUES (?,?,?,?,?)',
      [orderId, item.menu_item_id, item.quantity, mi.price, item.notes || '']);
  });
  run('UPDATE tables SET status = ? WHERE id = ?', ['occupied', table_id]);
  res.json({ order_id: orderId, total });
});

app.put('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  run("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, req.params.id]);
  if (status === 'completed' || status === 'cancelled') {
    const order = get('SELECT table_id FROM orders WHERE id = ?', [req.params.id]);
    if (order) run('UPDATE tables SET status = ? WHERE id = ?', ['available', order.table_id]);
  }
  res.json({ success: true });
});

app.put('/api/orders/:id/pay', (req, res) => {
  const { payment_method } = req.body;
  run("UPDATE orders SET payment_method=?, payment_status='paid', status='completed', updated_at=datetime('now') WHERE id=?",
    [payment_method, req.params.id]);
  const order = get('SELECT table_id FROM orders WHERE id = ?', [req.params.id]);
  if (order) run('UPDATE tables SET status = ? WHERE id = ?', ['available', order.table_id]);
  res.json({ success: true });
});

// ─── STATS ────────────────────────────────────────────────────────
app.get('/api/admin/stats', authMiddleware, (req, res) => {
  const totalOrders = get("SELECT COUNT(*) as c FROM orders WHERE date(created_at) = date('now')").c;
  const revenue = get("SELECT COALESCE(SUM(total_amount),0) as r FROM orders WHERE payment_status='paid' AND date(created_at) = date('now')").r;
  const pendingOrders = get("SELECT COUNT(*) as c FROM orders WHERE status IN ('pending','preparing')").c;
  const availableTables = get("SELECT COUNT(*) as c FROM tables WHERE status='available'").c;
  const occupiedTables = get("SELECT COUNT(*) as c FROM tables WHERE status='occupied'").c;
  res.json({ totalOrders, revenue, pendingOrders, availableTables, occupiedTables });
});

// ─── SERVE FRONTEND ───────────────────────────────────────────────
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin/index.html')));
app.get('/kitchen', (req, res) => res.sendFile(path.join(__dirname, '../frontend/kitchen/index.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/customer/index.html')));

// ─── START ────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => {
    console.log('\n🍽️  Table Top Ordering System');
    console.log(`✅ Running at:  http://localhost:${PORT}`);
    console.log(`👑 Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`👨‍🍳 Kitchen:     http://localhost:${PORT}/kitchen`);
    console.log(`🪑 Customer:    http://localhost:${PORT}/?table=1`);
    console.log('\n🔐 Admin Login → Username: Admin | Password: Admin123\n');
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
