# Runs tools/packs.mjs with the Node.js runtime bundled in Foundry, so Node doesn't need to be installed.
# Usage: tools/packs.ps1 build|extract [pack ...]   (close Foundry first; it locks the packs)
param([Parameter(Mandatory = $true)][ValidateSet("build", "extract")][string]$Command, [string[]]$Packs = @())

$root = Split-Path -Parent $PSScriptRoot
$config = Get-Content (Join-Path $root "foundry-config.yaml") -Raw
if ($config -notmatch 'installPath:\s*"?([^"\r\n]+)"?') { throw "Set installPath in foundry-config.yaml to your Foundry install folder." }
$installPath = $Matches[1] -replace '\\\\', '\'
$exe = Get-ChildItem $installPath -Filter "*.exe" | Where-Object { $_.Name -notlike "Uninstall*" } | Select-Object -First 1
if (-not $exe) { throw "No Foundry executable found in $installPath" }

$env:ELECTRON_RUN_AS_NODE = "1"
try {
  # Foundry's exe is a GUI program, so PowerShell only waits for it (and shows its output) when the output is piped
  & $exe.FullName (Join-Path $PSScriptRoot "packs.mjs") $Command @Packs 2>&1 | ForEach-Object { "$_" }
  exit $LASTEXITCODE
} finally {
  Remove-Item Env:ELECTRON_RUN_AS_NODE
}
