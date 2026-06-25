# 🍽️ Restaurant Management System | Pétale

A full-stack restaurant ordering system built with Node.js, Express, SQLite, and vanilla HTML/CSS/JS.

## 📋 Features

- **Customer Ordering** – Browse menu by category, add to cart, place orders, view bill & pay
- **Kitchen Display** – Real-time order queue with status updates (Pending → Preparing → Ready)
- **Admin Panel** – Full CRUD for menu items, categories, order management, table overview, revenue stats
- **Table Management** – 10 tables pre-seeded, status tracked automatically
- **Authentication** – JWT-based admin login

## 🔐 Admin Credentials
| Field | Value |
|-------|-------|
| Username | `Admin` |
| Password | `Admin123` |

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Start the Server

```bash
npm start
```

Or with auto-reload (development):
```bash
npm run dev
```

### 3. Open in Browser

| URL | Description |
|-----|-------------|
| `http://localhost:3001/` | Customer Ordering (select a table) |
| `http://localhost:3001/?table=1` | Customer at Table 1 directly |
| `http://localhost:3001/admin` | Admin Panel |
| `http://localhost:3001/kitchen` | Kitchen Display Screen |

## 🗂️ Project Structure

```
tabletop-ordering/
├── backend/
│   ├── server.js          # Main Express server + all API routes
│   ├── package.json       # Dependencies
│   └── tabletop.db        # SQLite DB (auto-created on first run)
└── frontend/
    ├── customer/
    │   └── index.html     # Customer ordering interface
    ├── kitchen/
    │   └── index.html     # Kitchen display (auto-refreshes every 15s)
    └── admin/
        └── index.html     # Admin panel (login required)
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js + Express |
| Database | SQLite (via better-sqlite3) |
| Auth | JWT + bcryptjs |
| Frontend | Vanilla HTML/CSS/JS |

## 📡 API Endpoints

### Public
- `GET /api/categories` – All categories
- `GET /api/menu` – Available menu items
- `GET /api/tables` – All tables
- `POST /api/orders` – Place an order
- `GET /api/orders/table/:id` – Active order for a table
- `GET /api/orders/kitchen` – Kitchen queue (pending/preparing)
- `PUT /api/orders/:id/status` – Update order status
- `PUT /api/orders/:id/pay` – Process payment

### Admin (requires JWT)
- `POST /api/admin/login` – Login
- `GET /api/admin/stats` – Dashboard statistics
- `GET /api/menu/all` – All menu items (including unavailable)
- `POST /api/menu` – Add menu item
- `PUT /api/menu/:id` – Update menu item
- `DELETE /api/menu/:id` – Delete menu item
- `POST /api/categories` – Add category
- `PUT /api/categories/:id` – Update category
- `DELETE /api/categories/:id` – Delete category
- `GET /api/tables/all` – Tables with active order info
- `GET /api/orders` – All orders
- `GET /api/orders/:id` – Order details with items

## 🪑 Seeded Data

- **10 Tables** (auto-seeded)
- **5 Categories**: Starters, Main Course, Beverages, Desserts, Fast Food
- **14 Menu Items** with prices, spicy levels, and offers
- **Admin user**: Admin / Admin123

## 💡 VS Code Live Server

If using VS Code with the **Live Server** extension, note that the backend must still run separately:

1. Open terminal in VS Code → `cd backend && npm start`
2. The backend serves all frontend files at `http://localhost:3001`
3. No separate live server needed — just open `http://localhost:3001`
