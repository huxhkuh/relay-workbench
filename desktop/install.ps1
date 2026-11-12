param([Parameter(Mandatory=$true)][string]$Source, [switch]$Quiet)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
try {
    $Source = (Resolve-Path -LiteralPath $Source).Path
    $manifest = Get-Content -LiteralPath (Join-Path $Source 'release-manifest.json') -Raw | ConvertFrom-Json
    if ($manifest.product -ne 'boau-code' -or $manifest.version -notmatch '^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$') { throw 'חבילת ההתקנה אינה תקינה.' }
    if (@($manifest.files).Count -lt 5) { throw 'רשימת הקבצים חסרה.' }
    foreach ($entry in $manifest.files) {
        $full = [IO.Path]::GetFullPath((Join-Path $Source $entry.path))
        if (-not $full.StartsWith($Source.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'נתיב חבילה אינו תקין.' }
        if ((Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash -ine $entry.sha256) { throw "בדיקת שלמות נכשלה: $($entry.path)" }
    }
    $parent = Join-Path $env:LOCALAPPDATA 'Programs'
    $target = Join-Path $parent ('Boau-Code-' + $manifest.version + '-' + (Get-Date -Format 'yyyyMMddHHmmss'))
    New-Item -ItemType Directory -Path $target | Out-Null
    foreach ($entry in $manifest.files) {
        $dest = Join-Path $target $entry.path
        New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $Source $entry.path) -Destination $dest
    }
    $exe = Join-Path $target 'Boau-Code.exe'
    if (!(Test-Path -LiteralPath $exe)) { throw 'קובץ ההפעלה חסר.' }
    $icon = Join-Path $target 'Relay-Workbench.ico'
    if (!(Test-Path -LiteralPath $icon)) { $icon = $exe }
    $wsh = New-Object -ComObject WScript.Shell
    $previous = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\BoauCode' -ErrorAction SilentlyContinue).InstallLocation
    foreach ($link in @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Relay Workbench.lnk'), (Join-Path ([Environment]::GetFolderPath('Programs')) 'Relay Workbench.lnk'))) {
        $shortcut = $wsh.CreateShortcut($link); $shortcut.TargetPath=$exe; $shortcut.WorkingDirectory=$target; $shortcut.IconLocation="$icon,0"; $shortcut.Save()
    }
    if ($previous) {
      foreach ($folder in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))) {
        $oldLink = Join-Path $folder 'בואו קוד.lnk'
        if ((Test-Path -LiteralPath $oldLink) -and $wsh.CreateShortcut($oldLink).TargetPath -ieq (Join-Path $previous 'Boau-Code.exe')) { Remove-Item -LiteralPath $oldLink }
      }
    }
    $uninstall = Join-Path $target 'Uninstall-Boau-Code.ps1'
    @'
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$root = $PSScriptRoot
$allowed = Join-Path $env:LOCALAPPDATA 'Programs'
$full = [IO.Path]::GetFullPath($root)
if ((Split-Path $full) -ine $allowed -or (Split-Path $full -Leaf) -notlike 'Boau-Code-*') { throw 'Invalid installation path' }
if ([Windows.Forms.MessageBox]::Show('להסיר את התוכנה? השיחות, ההעדפות והגיבויים יישמרו.', 'Relay Workbench', 'YesNo') -ne 'Yes') { exit }
$wsh = New-Object -ComObject WScript.Shell
foreach ($link in @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Relay Workbench.lnk'), (Join-Path ([Environment]::GetFolderPath('Programs')) 'Relay Workbench.lnk'))) {
  if ((Test-Path -LiteralPath $link) -and $wsh.CreateShortcut($link).TargetPath -ieq (Join-Path $root 'Boau-Code.exe')) { Remove-Item -LiteralPath $link }
}
Get-Process 'Boau-Code' -ErrorAction SilentlyContinue | Where-Object Path -eq (Join-Path $root 'Boau-Code.exe') | Stop-Process
Remove-Item -LiteralPath $full -Recurse -Force
Remove-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\BoauCode' -ErrorAction SilentlyContinue
'@ | Set-Content -LiteralPath $uninstall -Encoding UTF8
    $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\BoauCode'
    New-Item -Path $key -Force | Out-Null
    New-ItemProperty -Path $key -Name DisplayName -Value 'Relay Workbench' -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $key -Name DisplayVersion -Value $manifest.version -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $key -Name InstallLocation -Value $target -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $key -Name DisplayIcon -Value $icon -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $key -Name UninstallString -Value ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $uninstall + '"') -PropertyType String -Force | Out-Null
    Write-Output $target
    if (!$Quiet) { [Windows.Forms.MessageBox]::Show('ההתקנה הושלמה. אפשר לפתוח את הגרסה החדשה מקיצור הדרך. נתוני המשתמש נשמרו.', 'Relay Workbench') | Out-Null }
} catch {
    if ($Quiet) { Write-Error $_.Exception.Message } else { [Windows.Forms.MessageBox]::Show($_.Exception.Message, 'ההתקנה לא הושלמה') | Out-Null }
    exit 1
}
