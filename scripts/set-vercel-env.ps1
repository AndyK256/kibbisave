$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot\..

function Add-VercelEnv([string]$Name, [string]$Value) {
  if (-not $Value) {
    Write-Host "skip $Name (empty)"
    return
  }
  $output = $Value | & npx.cmd vercel env add $Name production --yes --force 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "ok $Name"
  } else {
    Write-Host "fail $Name`: $output"
    $script:failed = $true
  }
}

$local = @{}
Get-Content .env | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith('#')) { return }
  $eq = $line.IndexOf('=')
  if ($eq -lt 1) { return }
  $key = $line.Substring(0, $eq).Trim()
  $val = $line.Substring($eq + 1).Trim()
  $local[$key] = $val
}

$failed = $false

Add-VercelEnv 'APP_URL' 'https://kibbisave.com'
Add-VercelEnv 'GOOGLE_CALLBACK_URL' 'https://kibbisave.com/api/auth/google/callback'
Add-VercelEnv 'GOOGLE_CLIENT_ID' $local['GOOGLE_CLIENT_ID']
Add-VercelEnv 'GOOGLE_CLIENT_SECRET' $local['GOOGLE_CLIENT_SECRET']
Add-VercelEnv 'JWT_SECRET' $local['JWT_SECRET']
Add-VercelEnv 'RESEND_API_KEY' $local['RESEND_API_KEY']
Add-VercelEnv 'RESEND_FROM_EMAIL' $local['RESEND_FROM_EMAIL']
Add-VercelEnv 'DATABASE_URL' $local['DATABASE_URL']
Add-VercelEnv 'NODE_ENV' 'production'

if ($failed) { exit 1 }
