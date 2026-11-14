# Moves your finished local documents (with audio, folders and listening position)
# into your CLOUD account, so they appear on your phone too. Safe to run again:
# anything already in the cloud is skipped.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$svc  = "C:\Users\shale\doc-to-audio-services"
$env:Path = "C:\Program Files\nodejs;$env:Path"

Write-Host "Move local documents to the cloud" -ForegroundColor Cyan
Write-Host "Use the account you registered on https://doc-to-audio-web.vercel.app`n"
$email = Read-Host "Cloud email"
$sec   = Read-Host "Cloud password" -AsSecureString
$env:CLOUD_EMAIL = $email
$env:CLOUD_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))

# The importer reads your local database, so make sure it is running.
$net = Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue
if (-not $net) {
  Write-Host "Starting local database..."
  Remove-Item "$svc\pgdata\postmaster.pid" -Force -ErrorAction SilentlyContinue
  Start-Process "$svc\pgsql\bin\pg_ctl.exe" -ArgumentList "-D `"$svc\pgdata`" -l `"$svc\pg.log`" -o `"-p 5432`" start" -WindowStyle Hidden
  for ($i = 0; $i -lt 20 -and -not (Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep 1 }
}

Set-Location "$root\apps\api"
& "C:\Program Files\nodejs\node.exe" scripts\import-to-cloud.mjs
$code = $LASTEXITCODE
$env:CLOUD_PASSWORD = $null
Write-Host ""
if ($code -eq 0) { Write-Host "All done. Open the cloud site on your phone to see them." -ForegroundColor Green }
else { Write-Host "Finished with problems (see lines marked FAIL above). You can run this again safely." -ForegroundColor Yellow }
Read-Host "Press Enter to close"
