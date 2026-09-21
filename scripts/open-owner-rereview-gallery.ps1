# Opens the Final PASS owner re-review gallery (file://) in the default browser.
$root = Split-Path -Parent $PSScriptRoot
$html = Join-Path $root 'docs/evidence/final-two-blockers-2026-09-21_112345/ui/OWNER_REVIEW_GALLERY.html'
if (-not (Test-Path -LiteralPath $html)) {
    Write-Error "Gallery not found: $html"
}
Start-Process $html
