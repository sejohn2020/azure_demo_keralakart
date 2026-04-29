#!/usr/bin/env bash
# =============================================================
#  KeralaKart Demo — Stage 01 MVP
#  File   : config/00-config.sh
#  Purpose: Single source of truth for ALL variable names.
#           Source this file from every other script.
#  Usage  : source ./config/00-config.sh
# =============================================================

# ── Azure Subscription ────────────────────────────────────────
# Leave blank to auto-detect from `az account show`
export SUBSCRIPTION_ID=""

# ── Naming building blocks ────────────────────────────────────
export PREFIX="kk"           # project short name
export ENV="dev"             # dev | stg | prod
export REGION_ABBR="cus"     # short region code for naming
export LOCATION="centralus"

# ── Resource Group ────────────────────────────────────────────
export RG="rg-${PREFIX}-${ENV}-${REGION_ABBR}-001"

# ── App Service (Frontend) ────────────────────────────────────
export ASP_NAME="asp-${PREFIX}-${ENV}-${REGION_ABBR}-001"
export WEBAPP_NAME="app-${PREFIX}-${ENV}-${REGION_ABBR}-001"

# ── Function App (API) ────────────────────────────────────────
# Function App needs its own dedicated Storage for runtime state
export FUNC_STORAGE="st${PREFIX}func${REGION_ABBR}001"
export FUNC_PLAN_NAME="plan-${PREFIX}-func-${ENV}-${REGION_ABBR}-001"
export FUNC_NAME="func-${PREFIX}-${ENV}-${REGION_ABBR}-001"

# ── Blob Storage (App data — product images, uploads etc.) ────
export STORAGE_NAME="st${PREFIX}${ENV}${REGION_ABBR}001"
export STORAGE_CONTAINER="products"

# ── Azure SQL ─────────────────────────────────────────────────
export SQL_SERVER="sql-${PREFIX}-${ENV}-${REGION_ABBR}-001"
export SQL_DB="sqldb-${PREFIX}-${ENV}-${REGION_ABBR}-001"
export SQL_ADMIN="sqladmin"
# SQL_PASSWORD — do NOT set here. Scripts will prompt at runtime.

# ── Tags ──────────────────────────────────────────────────────
export TAGS="project=keralakart env=${ENV} managed-by=cli stage=mvp"
