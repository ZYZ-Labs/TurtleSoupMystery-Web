#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$REPO_ROOT/VERSION"
CONFIG_DIR="$REPO_ROOT/.deploy"
CONFIG_PATH="$CONFIG_DIR/registry.env"

DEFAULT_REGISTRY_HOST="crpi-2iicgf8z27uyvaq1.cn-hangzhou.personal.cr.aliyuncs.com"
DEFAULT_NAMESPACE="silvericekey"
DEFAULT_IMAGE_NAME="turtle_soup_mystery"
DEFAULT_LOGIN_USERNAME="z516798599@qq.com"

print_info() { echo "[INFO] $1"; }
print_warn() { echo "[WARN] $1"; }
fail() { echo "[ERROR] $1" >&2; exit 1; }

normalize_host() {
  local value="${1:-}"
  value="${value#http://}"
  value="${value#https://}"
  value="${value%/}"
  printf '%s' "$value"
}

normalize_segment() {
  local value="${1:-}"
  value="${value#/}"
  value="${value%/}"
  printf '%s' "$value"
}

project_version() {
  if [ -f "$VERSION_FILE" ]; then
    tr -d '\r\n' < "$VERSION_FILE"
  else
    printf '%s' "0.1.0"
  fi
}

validate_tag() {
  [[ "${1:-}" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+([._-][0-9A-Za-z.-]+)?$ ]]
}

prompt_value() {
  local label="$1"
  local default_value="${2:-}"
  local value
  if [ -n "$default_value" ]; then
    read -r -p "$label [$default_value]: " value
  else
    read -r -p "$label: " value
  fi
  value="${value%$'\r'}"
  if [ -z "$value" ]; then
    value="$default_value"
  fi
  printf '%s' "$value"
}

load_config() {
  REGISTRY_HOST="$DEFAULT_REGISTRY_HOST"
  LOGIN_SERVER="$DEFAULT_REGISTRY_HOST"
  LOGIN_USERNAME="$DEFAULT_LOGIN_USERNAME"
  REGISTRY_NAMESPACE="$DEFAULT_NAMESPACE"
  IMAGE_NAME="$DEFAULT_IMAGE_NAME"
  IMAGE_TAG="$(project_version)"

  if [ -f "$CONFIG_PATH" ]; then
    # shellcheck disable=SC1090
    source "$CONFIG_PATH"
  fi
}

save_config() {
  mkdir -p "$CONFIG_DIR"
  cat > "$CONFIG_PATH" <<EOF
REGISTRY_HOST=$REGISTRY_HOST
LOGIN_SERVER=$LOGIN_SERVER
LOGIN_USERNAME=$LOGIN_USERNAME
REGISTRY_NAMESPACE=$REGISTRY_NAMESPACE
IMAGE_NAME=$IMAGE_NAME
IMAGE_TAG=$IMAGE_TAG
EOF
}

collect_config() {
  REGISTRY_HOST="$(normalize_host "$(prompt_value 'Registry host' "$REGISTRY_HOST")")"
  LOGIN_SERVER="$(normalize_host "$(prompt_value 'Login server' "$LOGIN_SERVER")")"
  LOGIN_USERNAME="$(prompt_value 'Login username' "$LOGIN_USERNAME")"
  REGISTRY_NAMESPACE="$(normalize_segment "$(prompt_value 'Namespace' "$REGISTRY_NAMESPACE")")"
  IMAGE_NAME="$(normalize_segment "$(prompt_value 'Image name' "$IMAGE_NAME")")"
  IMAGE_TAG="$(prompt_value 'Image version tag' "$IMAGE_TAG")"

  validate_tag "$IMAGE_TAG" || fail "Tag format is invalid: $IMAGE_TAG"
}

build_image() {
  printf '%s' "$(normalize_host "$REGISTRY_HOST")/$(normalize_segment "$REGISTRY_NAMESPACE")/$(normalize_segment "$IMAGE_NAME"):$IMAGE_TAG"
}

TAG_OVERRIDE=""
RECONFIGURE=false
SKIP_LOGIN=false

for arg in "$@"; do
  case "$arg" in
    --tag=*)
      TAG_OVERRIDE="${arg#*=}"
      ;;
    --reconfigure)
      RECONFIGURE=true
      ;;
    --skip-login)
      SKIP_LOGIN=true
      ;;
  esac
done

load_config

if [ "$RECONFIGURE" = true ] || [ ! -f "$CONFIG_PATH" ]; then
  print_info "Starting interactive registry configuration."
  collect_config
  save_config
  print_info "Saved config to $CONFIG_PATH"
fi

if [ -n "$TAG_OVERRIDE" ]; then
  validate_tag "$TAG_OVERRIDE" || fail "Tag format is invalid: $TAG_OVERRIDE"
  IMAGE_TAG="$TAG_OVERRIDE"
  save_config
fi

IMAGE_REF="$(build_image)"
print_info "Target image: $IMAGE_REF"

if [ "$SKIP_LOGIN" != true ]; then
  print_info "Running docker login $(normalize_host "$LOGIN_SERVER")"
  docker login "$(normalize_host "$LOGIN_SERVER")" --username "$LOGIN_USERNAME"
fi

print_info "Building image from root Dockerfile"
docker build --pull -t "$IMAGE_REF" "$REPO_ROOT"

print_info "Pushing image to registry"
docker push "$IMAGE_REF"

echo
print_info "Publish complete."
echo "docker tag [ImageId] $IMAGE_REF"
echo "docker push $IMAGE_REF"
