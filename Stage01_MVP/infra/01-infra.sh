#!/usr/bin/env bash
# =============================================================
#  KeralaKart Demo — Stage 01 MVP
#  File   : infra/01-infra.sh
#  Purpose: Provision ALL Azure resources for Stage 01.
#  Run on : Azure Cloud Shell (Bash)
#
#  Creates:
#    ✓  1x Resource Group
#    ✓  Storage Account      (Function App runtime)
#    ✓  App Service Plan     (B1, Linux)
#    ✓  App Service          (Frontend)
#    ✓  Consumption Plan      (FC1 Flex Consumption — explicit plan creation)
#    ✓  Function App         (API, Flex Consumption, Node 24)
#    ✓  Storage Account      (Blob — app data)
#    ✓  Azure SQL Server     (SQL auth)
#    ✓  Azure SQL Database   (Serverless — auto-pauses at idle)
#
#  Idempotent: safe to re-run. Existing resources are skipped.
# =============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../config/00-config.sh"

# ── Pretty print helpers ──────────────────────────────────────
info()  { echo ""; echo "▶  $*"; }
ok()    { echo "   ✓  $*"; }
skip()  { echo "   –  $* already exists, skipping"; }
banner(){ echo ""; echo "══════════════════════════════════════════════════════"; echo "   $*"; echo "══════════════════════════════════════════════════════"; }

# ── Idempotency helpers ───────────────────────────────────────
exists_rg()        { az group show          -n "$1"              &>/dev/null; }
exists_storage()   { az storage account show -n "$1" -g "$2"    &>/dev/null; }
exists_asp()       { az appservice plan show -n "$1" -g "$2"    &>/dev/null; }
exists_webapp()    { az webapp show          -n "$1" -g "$2"    &>/dev/null; }
exists_funcapp()   { az functionapp show     -n "$1" -g "$2"    &>/dev/null; }
exists_sql_srv()   { az sql server show      -n "$1" -g "$2"    &>/dev/null; }
exists_sql_db()    { az sql db show          -n "$1" --server "$2" -g "$3" &>/dev/null; }

# ── Resolve Subscription ──────────────────────────────────────
if [[ -z "${SUBSCRIPTION_ID}" ]]; then
  SUBSCRIPTION_ID=$(az account show --query id -o tsv)
fi
echo ""
echo "  Subscription : ${SUBSCRIPTION_ID}"
echo "  Location     : ${LOCATION}"
echo "  Resource Group: ${RG}"
az account set --subscription "${SUBSCRIPTION_ID}"

# ── SQL Password (never stored in config) ────────────────────
if [[ -z "${SQL_PASSWORD:-}" ]]; then
  read -rsp "  Enter SQL admin password (min 12 chars, upper+lower+digit+special): " SQL_PASSWORD
  echo ""
fi
export SQL_PASSWORD

# ──────────────────────────────────────────────────────────────
banner "1 / 8  Resource Group"
# ──────────────────────────────────────────────────────────────
info "RG: ${RG}"
if exists_rg "${RG}"; then
  skip "${RG}"
else
  az group create \
    --name     "${RG}" \
    --location "${LOCATION}" \
    --tags     ${TAGS}
  ok "${RG} created"
fi

# ──────────────────────────────────────────────────────────────
banner "2 / 8  Storage — Function App Runtime"
# ──────────────────────────────────────────────────────────────
info "Storage: ${FUNC_STORAGE}"
if exists_storage "${FUNC_STORAGE}" "${RG}"; then
  skip "${FUNC_STORAGE}"
else
  az storage account create \
    --name              "${FUNC_STORAGE}" \
    --resource-group    "${RG}" \
    --location          "${LOCATION}" \
    --sku               Standard_LRS \
    --kind              StorageV2 \
    --min-tls-version   TLS1_2 \
    --tags              ${TAGS}
  ok "${FUNC_STORAGE} created"
fi

# ──────────────────────────────────────────────────────────────
banner "3 / 8  App Service Plan  (B1 Linux)"
# ──────────────────────────────────────────────────────────────
info "ASP: ${ASP_NAME}"
if exists_asp "${ASP_NAME}" "${RG}"; then
  skip "${ASP_NAME}"
else
  az appservice plan create \
    --name           "${ASP_NAME}" \
    --resource-group "${RG}" \
    --location       "${LOCATION}" \
    --sku            B1 \
    --is-linux \
    --tags           ${TAGS}
  ok "${ASP_NAME} created  (B1 Linux)"
fi

# ──────────────────────────────────────────────────────────────
banner "4 / 8  App Service  (Frontend)"
# ──────────────────────────────────────────────────────────────
info "Web App: ${WEBAPP_NAME}"
if exists_webapp "${WEBAPP_NAME}" "${RG}"; then
  skip "${WEBAPP_NAME}"
else
  az webapp create \
    --name           "${WEBAPP_NAME}" \
    --resource-group "${RG}" \
    --plan           "${ASP_NAME}" \
    --runtime        "NODE|24-lts" \
    --tags           ${TAGS}
  ok "${WEBAPP_NAME} created"
  ok "URL: https://${WEBAPP_NAME}.azurewebsites.net"
fi

# ──────────────────────────────────────────────────────────────
banner "5 / 8  Function App  (API — Flex Consumption)"
# ──────────────────────────────────────────────────────────────
# Flex Consumption (FC) is created via --flexconsumption-location.
# Y1 and FC1 are NOT valid SKUs for 'az functionapp plan create'.
# Azure manages the plan internally; idempotency is on the funcapp.
info "Function App: ${FUNC_NAME}"
if exists_funcapp "${FUNC_NAME}" "${RG}"; then
  skip "${FUNC_NAME}"
else
  az functionapp create \
    --name                        "${FUNC_NAME}" \
    --resource-group              "${RG}" \
    --storage-account             "${FUNC_STORAGE}" \
    --flexconsumption-location    "${LOCATION}" \
    --runtime                     node \
    --runtime-version             20 \
    --functions-version           4
  ok "${FUNC_NAME} created  (Flex Consumption, Node 20)"
  ok "URL: https://${FUNC_NAME}.azurewebsites.net"
fi

# ──────────────────────────────────────────────────────────────
banner "6 / 8  Blob Storage  (App Data)"
# ──────────────────────────────────────────────────────────────
info "Storage: ${STORAGE_NAME}"
if exists_storage "${STORAGE_NAME}" "${RG}"; then
  skip "${STORAGE_NAME}"
else
  az storage account create \
    --name              "${STORAGE_NAME}" \
    --resource-group    "${RG}" \
    --location          "${LOCATION}" \
    --sku               Standard_LRS \
    --kind              StorageV2 \
    --min-tls-version   TLS1_2 \
    --tags              ${TAGS}
  ok "${STORAGE_NAME} created"
fi

info "Blob container: ${STORAGE_CONTAINER}"
STORAGE_KEY=$(az storage account keys list \
  -n "${STORAGE_NAME}" -g "${RG}" \
  --query '[0].value' -o tsv)

CONTAINER_EXISTS=$(az storage container exists \
  --name         "${STORAGE_CONTAINER}" \
  --account-name "${STORAGE_NAME}" \
  --account-key  "${STORAGE_KEY}" \
  --query exists -o tsv)

if [[ "${CONTAINER_EXISTS}" == "true" ]]; then
  skip "container/${STORAGE_CONTAINER}"
else
  az storage container create \
    --name         "${STORAGE_CONTAINER}" \
    --account-name "${STORAGE_NAME}" \
    --account-key  "${STORAGE_KEY}"
  ok "container/${STORAGE_CONTAINER} created"
fi

# ──────────────────────────────────────────────────────────────
banner "7 / 8  Azure SQL Server"
# ──────────────────────────────────────────────────────────────
info "SQL Server: ${SQL_SERVER}"
if exists_sql_srv "${SQL_SERVER}" "${RG}"; then
  skip "${SQL_SERVER}"
else
  az sql server create \
    --name           "${SQL_SERVER}" \
    --resource-group "${RG}" \
    --location       "${LOCATION}" \
    --admin-user     "${SQL_ADMIN}" \
    --admin-password "${SQL_PASSWORD}"
  ok "${SQL_SERVER} created"
fi

# Required: Consumption Plan Function App uses shared Azure IPs.
# This rule (0.0.0.0 → 0.0.0.0) allows all Azure-internal traffic.
info "SQL Firewall: AllowAzureServices"
az sql server firewall-rule create \
  --server         "${SQL_SERVER}" \
  --resource-group "${RG}" \
  --name           "AllowAzureServices" \
  --start-ip-address 0.0.0.0 \
  --end-ip-address   0.0.0.0 \
  2>/dev/null || true
ok "Firewall rule set"

# ──────────────────────────────────────────────────────────────
banner "8 / 8  Azure SQL Database  (Serverless)"
# ──────────────────────────────────────────────────────────────
info "SQL DB: ${SQL_DB}"
if exists_sql_db "${SQL_DB}" "${SQL_SERVER}" "${RG}"; then
  skip "${SQL_DB}"
else
  az sql db create \
    --name           "${SQL_DB}" \
    --server         "${SQL_SERVER}" \
    --resource-group "${RG}" \
    --edition        GeneralPurpose \
    --family         Gen5 \
    --capacity       1 \
    --compute-model  Serverless \
    --auto-pause-delay 60 \
    --min-capacity   0.5 \
    --tags           ${TAGS}
  ok "${SQL_DB} created  (Serverless, auto-pause after 60 min idle)"
fi

# ──────────────────────────────────────────────────────────────
banner "Stage 01 — Infrastructure Ready"
# ──────────────────────────────────────────────────────────────
echo ""
echo "   Resource Group : ${RG}"
echo "   Web App URL    : https://${WEBAPP_NAME}.azurewebsites.net"
echo "   Function App   : https://${FUNC_NAME}.azurewebsites.net"
echo "   SQL Server     : ${SQL_SERVER}.database.windows.net"
echo "   SQL Database   : ${SQL_DB}"
echo "   Blob Storage   : ${STORAGE_NAME} / ${STORAGE_CONTAINER}"
echo ""
echo "   Next step:"
echo "     bash deploy/02-deploy-frontend.sh"
echo "     bash deploy/03-deploy-api.sh"
echo ""
