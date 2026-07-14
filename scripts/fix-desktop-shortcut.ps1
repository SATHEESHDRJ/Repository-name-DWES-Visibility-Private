# Compatibility entry point. Prefer Create-DWES-Shortcuts.ps1.
param([switch]$IncludeProd)

$script = Join-Path $PSScriptRoot 'Create-DWES-Shortcuts.ps1'
if ($IncludeProd) {
  & $script -IncludeProd
} else {
  & $script
}
exit $LASTEXITCODE
