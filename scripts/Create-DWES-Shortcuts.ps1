# Create the canonical one-click DWES Start and Stop shortcuts.
param(
  [string]$DesktopPath = [Environment]::GetFolderPath('Desktop'),
  [switch]$SkipStartMenu,
  [switch]$IncludeProd
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$startLauncher = Join-Path $PSScriptRoot 'Start-DWES-Hidden.vbs'
$stopLauncher = Join-Path $PSScriptRoot 'Stop-DWES-Hidden.vbs'
$prodLauncher = Join-Path $root 'Start DWES Prod (Hidden).vbs'
$startIcon = Join-Path $root 'public\app-icon.ico'
$stopIconDll = Join-Path $env:SystemRoot 'System32\shell32.dll'
$stopIcon = "$stopIconDll,27"

foreach ($required in @($wscript, $startLauncher, $stopLauncher, $startIcon, $stopIconDll)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Required launcher asset not found: $required" }
}
New-Item -ItemType Directory -Path $DesktopPath -Force | Out-Null

$shell = New-Object -ComObject WScript.Shell

function New-DwesShortcut {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Launcher,
    [Parameter(Mandatory = $true)][string]$IconLocation,
    [Parameter(Mandatory = $true)][string]$Description
  )
  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $wscript
  $shortcut.Arguments = ('"{0}"' -f $Launcher)
  $shortcut.WorkingDirectory = $root
  $shortcut.IconLocation = $IconLocation
  $shortcut.WindowStyle = 1
  $shortcut.Description = $Description
  $shortcut.Save()
}

$emDash = [char]0x2014
$startName = "DWES $emDash Start Application.lnk"
$stopName = "DWES $emDash Stop Application.lnk"
$startPath = Join-Path $DesktopPath $startName
$stopPath = Join-Path $DesktopPath $stopName

# Remove only known legacy DWES shortcuts; never wildcard-delete unrelated links.
foreach ($legacyName in @('DWES.lnk', 'Start DWES.lnk', 'Stop DWES.lnk')) {
  Remove-Item -LiteralPath (Join-Path $DesktopPath $legacyName) -Force -ErrorAction SilentlyContinue
}

New-DwesShortcut -Path $startPath -Launcher $startLauncher -IconLocation "$startIcon,0" `
  -Description 'Start the complete DWES application after database and health checks'
New-DwesShortcut -Path $stopPath -Launcher $stopLauncher -IconLocation $stopIcon `
  -Description 'Stop only DWES frontend and backend processes; leave PostgreSQL running'

if ($IncludeProd) {
  if (-not (Test-Path -LiteralPath $prodLauncher)) { throw "Production launcher not found: $prodLauncher" }
  New-DwesShortcut -Path (Join-Path $DesktopPath "DWES $emDash Start Application (Production).lnk") `
    -Launcher $prodLauncher -IconLocation "$startIcon,0" -Description 'Start the built DWES production application'
}

if (-not $SkipStartMenu) {
  $startMenuDir = Join-Path ([Environment]::GetFolderPath('Programs')) 'DWES'
  New-Item -ItemType Directory -Path $startMenuDir -Force | Out-Null
  New-DwesShortcut -Path (Join-Path $startMenuDir $startName) -Launcher $startLauncher `
    -IconLocation "$startIcon,0" -Description 'Start the complete DWES application'
  New-DwesShortcut -Path (Join-Path $startMenuDir $stopName) -Launcher $stopLauncher `
    -IconLocation $stopIcon -Description 'Stop only the DWES application services'
}

Write-Output "[DWES] Created: $startPath"
Write-Output "[DWES] Created: $stopPath"
Write-Output "[DWES] Start icon: $startIcon"
Write-Output "[DWES] Stop icon: $stopIcon"
