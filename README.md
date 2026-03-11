# EthioGebeya UltraScale

A more complete Ethiopian marketplace platform inspired by Amazon, with multi-role workflows, checkout, and built-in security controls.

## What is included

- **Customer features**: browse products, search/filter, add/remove cart items, checkout, and order history API.
- **Seller features**: authenticated seller dashboard, create products, and view seller-related orders.
- **Admin features**: platform metrics endpoint and audit visibility support.
- **Security**:
  - password hashing (PBKDF2)
  - signed auth tokens (HMAC)
  - role-based access control
  - payload size limits + JSON validation
  - request rate limiting
  - security headers (CSP, frame denial, no sniff, etc.)
- **Operational basics**:
  - persistent JSON datastore (`data/db.json`)
  - product query caching for common list requests
  - health endpoint (`/api/health`)

## Demo credentials

- Admin: `admin@ethiogebeya.com / Admin@123`
- Seller: `seller@ethiogebeya.com / Seller@123`
- Customer: `customer@ethiogebeya.com / Customer@123`
# EthioGebeya

Ethiopian Amazon-style marketplace prototype.

## Features

- Multi-vendor marketplace homepage
- Ethiopian-themed hero and categories
- Featured products powered by a local API
- Local payments highlight (Telebirr / CBE Birr)
- Seller and delivery-oriented messaging

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js built-in HTTP server

## Run locally

```bash
node server.js
```

Open `http://localhost:3000`.

## API overview

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/products`
- `POST /api/seller/products` (seller/admin)
- `GET /api/cart` (auth)
- `POST /api/cart/items` (auth)
- `DELETE /api/cart/items/:productId` (auth)
- `POST /api/orders/checkout` (auth)
- `GET /api/orders/my` (auth)
- `GET /api/seller/orders` (seller/admin)
- `GET /api/admin/metrics` (admin)
- `GET /api/health`
Then open `http://localhost:3000`.
