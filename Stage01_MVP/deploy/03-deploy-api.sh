#!/usr/bin/env bash
# =============================================================
#  KeralaKart Demo — Stage 01 MVP
#  File   : deploy/03-deploy-api.sh
#  Purpose: Deploy the Function App API + configure app settings.
#  Run on : Azure Cloud Shell (Bash)
#
#  What it does:
#    1. Prompts for SQL password
#    2. Sets all Function App application settings (SQL + Storage)
#    3. npm install (production deps only)
#    4. Zip deploys to Function App via az functionapp deployment
# =============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../config/00-config.sh"

API_DIR="${SCRIPT_DIR}/../app/api"

info() { echo ""; echo "▶  $*"; }
ok()   { echo "   ✓  $*"; }

# ── Resolve Subscription ──────────────────────────────────────
if [[ -z "${SUBSCRIPTION_ID}" ]]; then
  SUBSCRIPTION_ID=$(az account show --query id -o tsv)
fi
az account set --subscription "${SUBSCRIPTION_ID}"

# ── SQL Password ──────────────────────────────────────────────
if [[ -z "${SQL_PASSWORD:-}" ]]; then
  read -rsp "  Enter SQL admin password: " SQL_PASSWORD
  echo ""
fi
export SQL_PASSWORD

# ── Step 1: Set Function App application settings ─────────────
# These become environment variables inside the running function.
info "Configuring Function App settings (SQL + Storage + JWT)..."

# Generate a random JWT secret if not already set
if [[ -z "${JWT_SECRET:-}" ]]; then
  JWT_SECRET=$(openssl rand -hex 32)
  echo "   ℹ  Generated JWT_SECRET (save this if you need to re-deploy without invalidating sessions)"
fi

STORAGE_CONN=$(az storage account show-connection-string \
  --name           "${STORAGE_NAME}" \
  --resource-group "${RG}" \
  --query connectionString -o tsv)

az functionapp config appsettings set \
  --name           "${FUNC_NAME}" \
  --resource-group "${RG}" \
  --settings \
    "SQL_SERVER=${SQL_SERVER}.database.windows.net" \
    "SQL_DATABASE=${SQL_DB}" \
    "SQL_USER=${SQL_ADMIN}" \
    "SQL_PASSWORD=${SQL_PASSWORD}" \
    "STORAGE_CONNECTION_STRING=${STORAGE_CONN}" \
    "JWT_SECRET=${JWT_SECRET}" \
  --output none

ok "App settings configured"

# ── Step 1b: Configure CORS ───────────────────────────────────
# The browser enforces same-origin policy — without this, every
# fetch() from the App Service domain to the Function App is blocked.
info "Configuring CORS on Function App..."
WEBAPP_ORIGIN="https://${WEBAPP_NAME}.azurewebsites.net"

az functionapp cors add \
  --name           "${FUNC_NAME}" \
  --resource-group "${RG}" \
  --allowed-origins "${WEBAPP_ORIGIN}"

# Also allow localhost for local development testing
az functionapp cors add \
  --name           "${FUNC_NAME}" \
  --resource-group "${RG}" \
  --allowed-origins "http://localhost:3000"

ok "CORS allowed for: ${WEBAPP_ORIGIN}"
info "Installing npm dependencies..."
cd "${API_DIR}"
npm install --production
ok "npm install done"

# ── Step 3: Zip and deploy ────────────────────────────────────
info "Creating deployment package..."
ZIP_PATH="/tmp/keralakart-api.zip"
rm -f "${ZIP_PATH}"

zip -r "${ZIP_PATH}" . \
  --exclude "*.git*" \
  --exclude ".vscode/*" \
  --exclude "node_modules/.cache/*" \
  --exclude "local.settings.json"

ok "Package created: ${ZIP_PATH}"

info "Deploying to Function App ${FUNC_NAME}..."
az functionapp deployment source config-zip \
  --name           "${FUNC_NAME}" \
  --resource-group "${RG}" \
  --src            "${ZIP_PATH}"

ok "Function App deployed"

echo ""
echo "   ✅  Test your API:"
echo "       curl https://${FUNC_NAME}.azurewebsites.net/api/getProducts"
echo ""
echo "   ✅  Open the frontend:"
echo "       https://${WEBAPP_NAME}.azurewebsites.net"
echo ""
