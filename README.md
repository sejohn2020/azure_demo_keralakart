# KeralaKart — Stage 01: MVP Go-Live

## What This Stage Creates

```
1 Resource Group
  ├── App Service Plan (B1, Linux)
  ├── App Service          ← Frontend (HTML/JS)
  ├── Function App         ← API (Node.js, Consumption Plan)
  ├── Storage Account      ← Function App runtime storage
  ├── Storage Account      ← Blob storage for app data
  ├── SQL Server
  └── SQL Database         ← Serverless (auto-pauses when idle)
```

No VNet. No Private Endpoints. No Managed Identity.
**Just get it working first — that is Stage 01.**

---

## Folder Structure

```
Stage01_MVP/
├── config/
│   └── 00-config.sh        ← EDIT THIS FIRST — all variables here
├── infra/
│   └── 01-infra.sh         ← Provisions all Azure resources
├── app/
│   ├── frontend/
│   │   └── public/
│   │       └── index.html  ← KeralaKart frontend — login, product grid, cart drawer, payment modal
│   └── api/
│       ├── host.json
│       ├── package.json
│       ├── shared/
│       │   └── auth.js         ← JWT sign/verify helpers (HS256, 8 h expiry)
│       ├── login/
│       │   ├── function.json
│       │   └── index.js        ← POST /api/login — bcrypt auth, seeds users table, returns JWT
│       ├── getProducts/
│       │   ├── function.json
│       │   └── index.js        ← GET /api/getProducts — product catalogue (JWT required)
│       ├── placeOrder/
│       │   ├── function.json
│       │   └── index.js        ← POST /api/placeOrder — creates order from cart (JWT required)
│       └── processPayment/
│           ├── function.json
│           └── index.js        ← POST /api/processPayment — simulated payment, 1.5 s delay (JWT required)
└── deploy/
    ├── 02-deploy-frontend.sh  ← Deploys frontend to App Service
    └── 03-deploy-api.sh       ← Deploys API to Function App
```

---

## Step-by-Step

### Step 1 — Edit config
```bash
nano config/00-config.sh
# Set SUBSCRIPTION_ID (or leave blank to auto-detect)
# Change PREFIX / ENV / REGION_ABBR if needed
```

### Step 2 — Provision infra
```bash
bash infra/01-infra.sh
# You will be prompted for the SQL admin password.
# Script is idempotent — safe to re-run.
```

### Step 3 — Deploy frontend
```bash
bash deploy/02-deploy-frontend.sh
```

### Step 4 — Deploy API
```bash
bash deploy/03-deploy-api.sh
# You will be prompted for the SQL admin password again.
```

### Step 5 — Test

```bash
# 1. Login and capture JWT
TOKEN=$(curl -s -X POST https://func-kk-dev-cus-001.azurewebsites.net/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"john","password":"Kerala@2025"}' | jq -r .token)

# 2. Browse products
curl -H "Authorization: Bearer $TOKEN" \
  https://func-kk-dev-cus-001.azurewebsites.net/api/getProducts

# 3. Place an order
curl -s -X POST https://func-kk-dev-cus-001.azurewebsites.net/api/placeOrder \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"items":[{"productId":1,"name":"Kerala Banana Chips","price":120,"qty":2}]}'

# 4. Process payment (use orderId from step 3)
curl -s -X POST https://func-kk-dev-cus-001.azurewebsites.net/api/processPayment \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"orderId":1,"totalAmount":240}'

# Frontend:
open https://app-kk-dev-cus-001.azurewebsites.net
```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/login` | None | Authenticate with username + password, returns JWT |
| GET | `/api/getProducts` | JWT | Returns product catalogue. Seeds `products` table on first call |
| POST | `/api/placeOrder` | JWT | Creates order from cart items. Body: `{ items: [{productId, name, price, qty}] }` |
| POST | `/api/processPayment` | JWT | Simulates payment (1.5 s delay). Body: `{ orderId, totalAmount }` |

### Demo users (auto-seeded on first login)

| Username | Password | Role |
|----------|----------|------|
| `john` | `Kerala@2025` | customer |
| `priya` | `Kerala@2025` | customer |
| `riyas` | `Kerala@2025` | customer |

> All functions fall back to **mock data** when `SQL_SERVER` env var is not set, so the demo works without a database.

---

## Tear Down

```bash
az group delete --name rg-kk-dev-cus-001 --yes --no-wait
```
