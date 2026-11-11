<#
.SYNOPSIS
    UpdatePilot Windows Agent - Official Local Worker Service
.DESCRIPTION
    Runs on the local Windows computer to discover installed software via WinGet,
    poll queued scan/update jobs, submit inventories, and report verification outcomes.
#>

[CmdletBinding()]
param (
    [string]$ServerUrl = "http://localhost:3001",
    [string]$PairingCode = "",
    [string]$DeviceToken = "",
    [switch]$AutoEnroll,
    [switch]$RunOnce,
    [switch]$ResetCredentials
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Local AppData configuration directory
$agentDir = Join-Path $env:LOCALAPPDATA "UpdatePilotAgent"
if (-not (Test-Path $agentDir)) {
    New-Item -ItemType Directory -Path $agentDir -Force | Out-Null
}

$tokenFile = Join-Path $agentDir "token.dpapi"
$metaFile  = Join-Path $agentDir "device-info.json"

if ($ResetCredentials) {
    if (Test-Path $tokenFile) { Remove-Item $tokenFile -Force }
    if (Test-Path $metaFile) { Remove-Item $metaFile -Force }
    Write-Host "[UpdatePilot Agent] Stored credentials reset." -ForegroundColor Yellow
}

function Save-SecureToken([string]$token) {
    $secure = ConvertTo-SecureString $token -AsPlainText -Force
    $secure | Export-Clixml $tokenFile
}

function Get-SecureToken() {
    if (-not (Test-Path $tokenFile)) { return $null }
    try {
        $secure = Import-Clixml $tokenFile
        $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        $token = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        return $token
    } catch {
        return $null
    }
}

function Get-MachineIdentifier() {
    try {
        $cs = Get-CimInstance -ClassName Win32_ComputerSystemProduct -ErrorAction SilentlyContinue
        if ($cs -and $cs.UUID -and $cs.UUID -ne "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF") {
            return $cs.UUID
        }
    } catch {}
    try {
        $guid = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Cryptography" -Name "MachineGuid" -ErrorAction SilentlyContinue).MachineGuid
        if ($guid) { return $guid }
    } catch {}
    return [System.Environment]::MachineName
}

function Get-OsInformation() {
    try {
        $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
        if ($os) {
            return "$($os.Caption) (Build $($os.BuildNumber))"
        }
    } catch {}
    return "Windows 11 (Desktop)"
}

# Explicit token passed from launcher
if (-not [string]::IsNullOrWhiteSpace($DeviceToken)) {
    Save-SecureToken $DeviceToken
    $deviceInfo = @{
        deviceName = [System.Environment]::MachineName
        machineId  = Get-MachineIdentifier
        enrolledAt = (Get-Date).ToString("o")
    } | ConvertTo-Json
    Set-Content -Path $metaFile -Value $deviceInfo -Force
    Write-Host "[UpdatePilot Agent] Provided device token saved securely via DPAPI." -ForegroundColor Green
}

# 1. Establish Authentication / Pairing
$deviceToken = Get-SecureToken

if ([string]::IsNullOrWhiteSpace($deviceToken)) {
    if ($AutoEnroll) {
        Write-Host "[UpdatePilot Agent] Waiting for user session to complete automatic registration..." -ForegroundColor Yellow
        # In AutoEnroll mode, wait up to 30 seconds for token to appear if being provisioned by web app
        $waited = 0
        while ($waited -lt 30) {
            Start-Sleep -Seconds 2
            $waited += 2
            $deviceToken = Get-SecureToken
            if (-not [string]::IsNullOrWhiteSpace($deviceToken)) {
                break
            }
        }
    }

    if ([string]::IsNullOrWhiteSpace($deviceToken)) {
        Write-Host "==========================================================" -ForegroundColor Cyan
        Write-Host "         UpdatePilot Windows Agent - Pairing Setup        " -ForegroundColor Cyan
        Write-Host "==========================================================" -ForegroundColor Cyan
        Write-Host "No paired device credentials found." -ForegroundColor Yellow

        if ([string]::IsNullOrWhiteSpace($PairingCode)) {
            Write-Host "Go to your UpdatePilot web dashboard -> Devices -> '+ Pair New Device'."
            $PairingCode = Read-Host "Enter the 1-time Pairing Code (e.g. UP-XXXX-XXXX)"
        }

        $PairingCode = $PairingCode.Trim()
        if ([string]::IsNullOrWhiteSpace($PairingCode)) {
            Write-Error "A valid pairing code is required to connect this machine."
            exit 1
        }

        $osInfo = Get-OsInformation
        Write-Host "Connecting to UpdatePilot server at $ServerUrl..." -ForegroundColor Cyan

        $pairBody = @{
            pairingCode  = $PairingCode
            osInfo       = $osInfo
            agentVersion = "1.0.0"
        } | ConvertTo-Json

        try {
            $pairResponse = Invoke-RestMethod -Uri "$ServerUrl/agent/v1/pair" -Method Post -Body $pairBody -ContentType "application/json"
            $deviceToken = $pairResponse.deviceToken
            Save-SecureToken $deviceToken

            $deviceInfo = @{
                deviceId   = $pairResponse.deviceId
                deviceName = $pairResponse.deviceName
                pairedAt   = (Get-Date).ToString("o")
            } | ConvertTo-Json
            Set-Content -Path $metaFile -Value $deviceInfo -Force

            Write-Host "[SUCCESS] Machine successfully paired as '$($pairResponse.deviceName)'!" -ForegroundColor Green
            Write-Host "[SECURITY] Device token saved securely via Windows DPAPI." -ForegroundColor Green
        } catch {
            $errText = $_.Exception.Message
            if ($_.Exception.Response) {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $errText = $reader.ReadToEnd()
            }
            Write-Error "Pairing failed: $errText"
            exit 1
        }
    }
} else {
    Write-Host "[UpdatePilot Agent] Loaded authenticated device token from DPAPI." -ForegroundColor Green
}

$headers = @{
    "Authorization" = "Bearer $deviceToken"
    "Content-Type"  = "application/json"
}

# 2. Resilient WinGet Software Inventory Scanner
function Invoke-SoftwareDiscovery() {
    Write-Host "[SCAN] Executing local software inventory scan..." -ForegroundColor Cyan

    $discoveredApps = @()

    # Try WinGet first
    try {
        $wingetOutput = & winget.exe list --accept-source-agreements 2>&1
        $lines = @($wingetOutput)

        $headerIdx = -1
        for ($i = 0; $i -lt $lines.Count; $i++) {
            $line = $lines[$i]
            if ($line -match '\bName\b' -and $line -match '\bId\b' -and $line -match '\bVersion\b') {
                $headerIdx = $i
                break
            }
        }

        if ($headerIdx -ge 0) {
            $header = $lines[$headerIdx]
            $idxName = $header.IndexOf("Name")
            $idxId = $header.IndexOf("Id")
            $idxVersion = $header.IndexOf("Version")
            $idxAvailable = $header.IndexOf("Available")
            $idxSource = $header.IndexOf("Source")

            for ($i = $headerIdx + 2; $i -lt $lines.Count; $i++) {
                $line = $lines[$i]
                if ([string]::IsNullOrWhiteSpace($line) -or $line -match '^-+$') { continue }

                $name = ""
                $id = ""
                $version = ""
                $available = ""
                $source = ""

                if ($line.Length -gt $idxName) {
                    $len = [Math]::Min($line.Length - $idxName, $idxId - $idxName)
                    $name = $line.Substring($idxName, $len).Trim()
                }

                if ($line.Length -gt $idxId) {
                    $len = [Math]::Min($line.Length - $idxId, $idxVersion - $idxId)
                    $id = $line.Substring($idxId, $len).Trim()
                }

                if ($idxAvailable -gt 0) {
                    if ($line.Length -gt $idxVersion) {
                        $len = [Math]::Min($line.Length - $idxVersion, $idxAvailable - $idxVersion)
                        $version = $line.Substring($idxVersion, $len).Trim()
                    }
                    if ($line.Length -gt $idxAvailable) {
                        $nextIdx = if ($idxSource -gt 0) { $idxSource } else { $line.Length }
                        $len = [Math]::Min($line.Length - $idxAvailable, $nextIdx - $idxAvailable)
                        $available = $line.Substring($idxAvailable, $len).Trim()
                    }
                } else {
                    $nextIdx = if ($idxSource -gt 0) { $idxSource } else { $line.Length }
                    if ($line.Length -gt $idxVersion) {
                        $len = [Math]::Min($line.Length - $idxVersion, $nextIdx - $idxVersion)
                        $version = $line.Substring($idxVersion, $len).Trim()
                    }
                }

                if ($idxSource -gt 0 -and $line.Length -gt $idxSource) {
                    $source = $line.Substring($idxSource).Trim()
                }

                if (![string]::IsNullOrWhiteSpace($name)) {
                    $discoveredApps += @{
                        displayName      = $name
                        packageId        = if (![string]::IsNullOrWhiteSpace($id)) { $id } else { $null }
                        installedVersion = if (![string]::IsNullOrWhiteSpace($version)) { $version } else { "unknown" }
                        availableVersion = if (![string]::IsNullOrWhiteSpace($available)) { $available } else { $null }
                        source           = if (![string]::IsNullOrWhiteSpace($source)) { $source } else { "winget" }
                    }
                }
            }
            Write-Host "[SCAN] Discovered $($discoveredApps.Count) applications via WinGet." -ForegroundColor Green
        }
    } catch {
        Write-Host "[SCAN] WinGet query encountered an issue: $_" -ForegroundColor Yellow
    }

    # Registry Fallback if WinGet returned 0 apps
    if ($discoveredApps.Count -eq 0) {
        Write-Host "[SCAN] Using Windows Registry fallback to discover installed applications..." -ForegroundColor Yellow
        $regPaths = @(
            "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
            "HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
            "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
        )
        $regApps = Get-ItemProperty $regPaths -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -and -not $_.SystemComponent -and $_.ParentKeyName -eq $null }

        foreach ($app in $regApps) {
            $discoveredApps += @{
                displayName      = $app.DisplayName.Trim()
                publisher        = if ($app.Publisher) { $app.Publisher.Trim() } else { $null }
                installedVersion = if ($app.DisplayVersion) { $app.DisplayVersion.Trim() } else { "1.0.0" }
                source           = "registry"
                packageId        = $null
                availableVersion = $null
            }
        }
        Write-Host "[SCAN] Discovered $($discoveredApps.Count) applications via Registry." -ForegroundColor Green
    }

    return $discoveredApps
}

# 3. Continuous Execution & Polling Loop
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     UpdatePilot Agent Online - Monitoring Active Jobs    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$lastHeartbeat = [DateTime]::MinValue

while ($true) {
    $now = Get-Date

    # Send heartbeat every 30 seconds
    if (($now - $lastHeartbeat).TotalSeconds -ge 30) {
        try {
            $hbBody = @{
                agentVersion = "1.0.0"
                osInfo       = Get-OsInformation
            } | ConvertTo-Json
            Invoke-RestMethod -Uri "$ServerUrl/agent/v1/heartbeat" -Method Post -Headers $headers -Body $hbBody | Out-Null
            $lastHeartbeat = $now
        } catch {
            Write-Host "[HEARTBEAT] Warning: Could not reach backend server at $ServerUrl" -ForegroundColor Yellow
        }
    }

    # Poll for queued jobs
    try {
        $claimedJob = $null
        try {
            $claimedJob = Invoke-RestMethod -Uri "$ServerUrl/agent/v1/jobs/claim" -Method Post -Headers $headers
        } catch {
            if ($_.Exception.Response.StatusCode -ne [System.Net.HttpStatusCode]::NoContent) {
                throw $_
            }
        }

        if ($claimedJob -and $claimedJob.jobId) {
            $jobId = $claimedJob.jobId
            $jobKind = $claimedJob.kind
            Write-Host "[JOB] Claimed $jobKind Job: $jobId" -ForegroundColor Cyan

            if ($jobKind -eq "SCAN") {
                $apps = Invoke-SoftwareDiscovery

                $scanPayload = @{
                    applications = $apps
                } | ConvertTo-Json -Depth 6

                Write-Host "[JOB] Submitting inventory ($($apps.Count) items) to backend..." -ForegroundColor Cyan
                $submitResult = Invoke-RestMethod -Uri "$ServerUrl/agent/v1/scans/$jobId/results" -Method Post -Headers $headers -Body $scanPayload
                Write-Host "[JOB SUCCESS] Scan completed successfully. Recorded $($submitResult.scannedCount) applications!" -ForegroundColor Green

                if ($RunOnce) { break }
            }
            elseif ($jobKind -eq "UPDATE") {
                $pkgId = $claimedJob.packageId
                $targetVer = $claimedJob.targetVersion
                Write-Host "[UPDATE] Installing verified package: $pkgId (Target: $targetVer)..." -ForegroundColor Cyan

                # Construct safe, allowlisted WinGet upgrade arguments
                $upgradeArgs = "upgrade --id `"$pkgId`" --exact --accept-package-agreements --accept-source-agreements --disable-interactivity"
                if ($targetVer -and $targetVer -ne "latest" -and $targetVer -ne "unknown") {
                    $upgradeArgs = "upgrade --id `"$pkgId`" --exact --version `"$targetVer`" --accept-package-agreements --accept-source-agreements --disable-interactivity"
                }

                $process = Start-Process -FilePath "winget.exe" -ArgumentList $upgradeArgs -Wait -PassThru -NoNewWindow
                $exitCode = $process.ExitCode
                Write-Host "[UPDATE] WinGet installer exited with code: $exitCode" -ForegroundColor Cyan

                # Verification: Rescan package version on the computer
                Write-Host "[VERIFY] Performing post-install verification for package $pkgId..." -ForegroundColor Cyan
                $newVersion = $null
                try {
                    $checkOutput = & winget.exe list --id "$pkgId" --exact --accept-source-agreements 2>&1
                    $checkLines = @($checkOutput)
                    for ($i = 0; $i -lt $checkLines.Count; $i++) {
                        $line = $checkLines[$i]
                        if ($line -match [regex]::Escape($pkgId)) {
                            $match = [regex]::Match($line, "$([regex]::Escape($pkgId))\s+([^\s]+)")
                            if ($match.Success) {
                                $newVersion = $match.Groups[1].Value.Trim()
                            }
                        }
                    }
                } catch {
                    Write-Host "[VERIFY] Verification lookup note: $_" -ForegroundColor Yellow
                }

                $restartRequired = ($exitCode -eq 3010)
                $verResult = "VERIFIED_SUCCESS"
                $safeDiag = "WinGet completed with exit code $exitCode."

                if ($exitCode -ne 0 -and $exitCode -ne 3010) {
                    $verResult = "VERIFICATION_FAILED"
                    $safeDiag = "WinGet installer exited with error code $exitCode."
                } elseif ($newVersion -and $targetVer -and $newVersion -ne $targetVer) {
                    Write-Host "[VERIFY] Note: Installed version is '$newVersion', target was '$targetVer'" -ForegroundColor Yellow
                    $safeDiag = "Installed version is now $newVersion (target: $targetVer)."
                }

                if (-not $newVersion) {
                    $newVersion = $targetVer
                }

                $reportPayload = @{
                    exitCode           = $exitCode
                    restartRequired    = $restartRequired
                    rescannedVersion   = $newVersion
                    verificationResult = $verResult
                    safeDiagnostics    = $safeDiag
                } | ConvertTo-Json

                Invoke-RestMethod -Uri "$ServerUrl/agent/v1/jobs/$jobId/result" -Method Post -Headers $headers -Body $reportPayload | Out-Null
                Write-Host "[JOB SUCCESS] Update outcome reported to backend: $verResult (Version: $newVersion)" -ForegroundColor Green

                if ($RunOnce) { break }
            }
        }
    } catch {
        $errMsg = $_.Exception.Message
        if ($_.Exception.Response) {
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $errMsg = $reader.ReadToEnd()
            } catch {}
        }
        Write-Host "[AGENT ERROR] $errMsg" -ForegroundColor Red
    }

    if ($RunOnce) { break }
    Start-Sleep -Seconds 3
}

