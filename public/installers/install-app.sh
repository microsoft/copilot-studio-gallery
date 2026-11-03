#!/usr/bin/env bash
set -Eeuo pipefail

guide="https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/#prerequisites"
temporary_file=""
cleanup() {
  local status=$?
  if [[ -n "$temporary_file" ]]; then rm -f -- "$temporary_file"; fi
  if [[ "$status" -ne 0 ]]; then
    printf '\nSetup stopped. Any created app folder is preserved. Resolve the error before resuming.\n' >&2
  fi
  exit "$status"
}
trap cleanup EXIT
fail() { printf '%s\nPrerequisites: %s\n' "$1" "$guide" >&2; exit 1; }
confirm() {
  local answer
  printf '\n%s [y/N] ' "$1"
  if ! read -r answer; then fail "No confirmation received. Nothing further will be installed."; fi
  [[ "$answer" = y || "$answer" = Y || "$answer" = yes ]] || fail "Cancelled."
}
run() { printf '\n>'; printf ' %q' "$@"; printf '\n'; "$@"; }
ms() { run npx --yes --package=@microsoft/managed-apps-cli -- ms "$@"; }

[[ $# -ge 1 && $# -le 13 ]] || fail "Usage: bash install-app.sh <submission> [connector:mode[:logical-table] ...]"
submission=$1
shift
[[ "$submission" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail "Invalid submission name."
for binding in "$@"; do
  [[ "$binding" =~ ^((shared_)?[a-z0-9_]{1,100}):(table|action)(:([A-Za-z][A-Za-z0-9_]{0,99}))?$ ]] || fail "Invalid connector binding."
  connector=${BASH_REMATCH[1]}
  mode=${BASH_REMATCH[3]}
  table=${BASH_REMATCH[5]:-}
  if [[ "$connector" = shared_commondataserviceforapps && "$mode" = table ]]; then
    [[ -n "$table" ]] || fail "Dataverse requires a logical table name."
  else
    [[ -z "$table" ]] || fail "Only Dataverse table bindings accept a fixed table."
  fi
done
[[ "$(uname -s)" = Darwin ]] || fail "This Bash installer supports macOS only. Linux is not supported."
[[ ! -e "./$submission" ]] || fail "The destination already exists. Choose an empty parent folder; existing work will not be overwritten."

node_ready() {
  local version
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && command -v npx >/dev/null 2>&1 || return 1
  version=$(node --version) || return 1
  [[ "$version" =~ ^v([0-9]+)\.([0-9]+)\. ]] || return 1
  [[ "${BASH_REMATCH[1]}" -gt 24 || ( "${BASH_REMATCH[1]}" -eq 24 && "${BASH_REMATCH[2]}" -ge 11 ) ]]
}
git_ready() {
  local version
  command -v git >/dev/null 2>&1 || return 1
  version=$(git --version) || return 1
  [[ "$version" != *"Apple Git"* ]] || return 1
  [[ "$version" =~ ([0-9]+)\.([0-9]+)\. ]] || return 1
  [[ "${BASH_REMATCH[1]}" -gt 2 || ( "${BASH_REMATCH[1]}" -eq 2 && "${BASH_REMATCH[2]}" -ge 27 ) ]]
}
gcm_ready() {
  if git credential-manager --version >/dev/null 2>&1; then
    gcm_command=credential-manager
  elif git credential-manager-core --version >/dev/null 2>&1; then
    gcm_command=credential-manager-core
  else
    return 1
  fi
}
ensure_brew() {
  if ! command -v brew >/dev/null 2>&1; then
    if [[ -x /opt/homebrew/bin/brew ]]; then export PATH="$PATH:/opt/homebrew/bin"
    elif [[ -x /usr/local/bin/brew ]]; then export PATH="$PATH:/usr/local/bin"
    else
      confirm "Missing prerequisites need Homebrew. Run the official Homebrew installer? It may request administrator approval."
      temporary_file=$(mktemp)
      run curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh -o "$temporary_file"
      run /bin/bash "$temporary_file"
      rm -f -- "$temporary_file"
      temporary_file=""
      if [[ -x /opt/homebrew/bin/brew ]]; then export PATH="$PATH:/opt/homebrew/bin"
      elif [[ -x /usr/local/bin/brew ]]; then export PATH="$PATH:/usr/local/bin"
      else fail "Homebrew was not found after installation. Follow its installation instructions and retry."; fi
    fi
  fi
  local prefix
  prefix=$(brew --prefix)
  export PATH="$PATH:$prefix/bin:$prefix/sbin:/usr/local/bin"
}

if ! node_ready; then
  confirm "Install Node.js LTS and npm with Homebrew? Existing Node installations will not be removed."
  ensure_brew
  run brew install node@24
  node_prefix=$(brew --prefix node@24)
  export PATH="$node_prefix/bin:$PATH"
  node_ready || fail "Node.js >=24.11, npm, and npx are still unavailable."
fi
if ! git_ready; then
  confirm "Install Homebrew Git for the managed repository's TLS 1.3 requirement? Existing Git installations will not be removed."
  ensure_brew
  run brew install git
  git_prefix=$(brew --prefix git)
  export PATH="$git_prefix/bin:$PATH"
  hash -r
  git_ready || fail "A compatible Git >=2.27 is still unavailable."
fi
if ! gcm_ready; then
  confirm "Install Git Credential Manager using its official Homebrew cask?"
  ensure_brew
  run brew install --cask git-credential-manager
  hash -r
  gcm_ready || fail "Git Credential Manager is still unavailable."
fi
helpers=""
if helpers=$(git config --get-all credential.helper); then
  :
else
  status=$?
  [[ "$status" -eq 1 ]] || exit "$status"
fi
if ! printf '%s\n' "$helpers" | grep -Eq '^(manager|manager-core)$|[/]git-credential-manager(-core)?["]?$'; then
  confirm "Configure Git Credential Manager for your account? Its configure command updates your Git credential-helper settings."
  run git "$gcm_command" configure
fi

ms auth login
ms auth status
ms app create "./$submission" --repo native --template "github:microsoft/copilot-studio-gallery/submissions/$submission/app#main"
cd "./$submission"
for binding in "$@"; do
  IFS=: read -r connector mode table <<< "$binding"
  arguments=(app add data-source --connector "$connector" --as "$mode")
  if [[ -n "$table" ]]; then arguments+=(--table "$table"); fi
  ms "${arguments[@]}"
done
run npm install
ms app pack
run git add --all
if git diff --cached --quiet; then
  :
else
  status=$?
  [[ "$status" -eq 1 ]] || exit "$status"
  run git commit -m "Configure gallery app" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
fi
run git push --set-upstream origin HEAD
ms app build
printf '\nOpen preview with the same account and tenant shown by ms auth status. Use the printed URL in the matching browser profile.\n'
ms app play --mode preview
