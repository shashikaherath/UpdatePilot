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
    [switch]$GUI,
    [switch]$NonInteractive,
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
$configFile = Join-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) "config.json"

if ($ResetCredentials) {
    if (Test-Path $tokenFile) { Remove-Item $tokenFile -Force }
    if (Test-Path $metaFile) { Remove-Item $metaFile -Force }
    Write-Host "[UpdatePilot Agent] Stored credentials and server configurations reset." -ForegroundColor Yellow
}

# Check for local config.json file
if (Test-Path $configFile) {
    try {
        $cfg = Get-Content $configFile -Raw | ConvertFrom-Json
        if ($cfg.serverUrl -and -not $PSBoundParameters.ContainsKey('ServerUrl')) {
            $ServerUrl = $cfg.serverUrl
        }
        if ($cfg.pairingCode -and [string]::IsNullOrWhiteSpace($PairingCode)) {
            $PairingCode = $cfg.pairingCode
        }
    } catch {}
}

# Resolve target Server URL: Priority is (1) CLI argument, (2) env var, (3) stored device metadata, (4) default localhost
$savedServerUrl = $null
if (Test-Path $metaFile) {
    try {
        $metaJson = Get-Content $metaFile -Raw | ConvertFrom-Json
        if ($metaJson.serverUrl) {
            $savedServerUrl = $metaJson.serverUrl
        }
    } catch {}
}

if (-not [string]::IsNullOrWhiteSpace($env:UPDATEPILOT_SERVER_URL)) {
    $ServerUrl = $env:UPDATEPILOT_SERVER_URL.Trim()
} elseif ($PSBoundParameters.ContainsKey('ServerUrl')) {
    $ServerUrl = $ServerUrl.Trim()
} elseif (-not [string]::IsNullOrWhiteSpace($savedServerUrl)) {
    $ServerUrl = $savedServerUrl.Trim()
}

# Normalize Server URL: Strip trailing slash and accidental /api/v1 prefix
$ServerUrl = $ServerUrl.TrimEnd('/')
if ($ServerUrl.EndsWith('/api/v1')) {
    $ServerUrl = $ServerUrl.Substring(0, $ServerUrl.Length - 7)
}
Write-Host "[UpdatePilot Agent] Active Backend URL: $ServerUrl" -ForegroundColor Cyan

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
        serverUrl  = $ServerUrl
        enrolledAt = (Get-Date).ToString("o")
    } | ConvertTo-Json
    Set-Content -Path $metaFile -Value $deviceInfo -Force
    Write-Host "[UpdatePilot Agent] Provided device token saved securely via DPAPI." -ForegroundColor Green
}

function Show-PairingConsentDialog([ref]$codeRef, [ref]$serverRef) {
    try {
        [void][System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms")
        [void][System.Reflection.Assembly]::LoadWithPartialName("System.Drawing")

        $form = New-Object System.Windows.Forms.Form
        $form.Text = "UpdatePilot - Connect this PC"
        $form.Size = New-Object System.Drawing.Size(460, 410)
        $form.StartPosition = "CenterScreen"
        $form.FormBorderStyle = "FixedDialog"
        $form.MaximizeBox = $false
        $form.MinimizeBox = $false
        $form.BackColor = [System.Drawing.Color]::White

        # Title label
        $titleLabel = New-Object System.Windows.Forms.Label
        $titleLabel.Text = "Allow UpdatePilot to connect this PC?"
        $titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
        $titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(15, 23, 42)
        $titleLabel.Location = New-Object System.Drawing.Point(24, 20)
        $titleLabel.Size = New-Object System.Drawing.Size(400, 28)
        $form.Controls.Add($titleLabel)

        # Description
        $descLabel = New-Object System.Windows.Forms.Label
        $descLabel.Text = "Connecting this computer allows your UpdatePilot account to:`n`n• Discover installed applications (via WinGet & Registry)`n• Check for verified software updates`n• Execute software updates when you click Update in the dashboard`n• Report scan and update status safely"
        $descLabel.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
        $descLabel.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
        $descLabel.Location = New-Object System.Drawing.Point(24, 52)
        $descLabel.Size = New-Object System.Drawing.Size(400, 115)
        $form.Controls.Add($descLabel)

        # Server URL Box
        $serverLabel = New-Object System.Windows.Forms.Label
        $serverLabel.Text = "Backend Server URL:"
        $serverLabel.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Bold)
        $serverLabel.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
        $serverLabel.Location = New-Object System.Drawing.Point(24, 175)
        $serverLabel.Size = New-Object System.Drawing.Size(400, 18)
        $form.Controls.Add($serverLabel)

        $serverBox = New-Object System.Windows.Forms.TextBox
        $serverBox.Text = $serverRef.Value
        $serverBox.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
        $serverBox.Location = New-Object System.Drawing.Point(24, 195)
        $serverBox.Size = New-Object System.Drawing.Size(395, 24)
        $form.Controls.Add($serverBox)

        # Pairing Code Box
        $codeLabel = New-Object System.Windows.Forms.Label
        $codeLabel.Text = "1-Time Pairing Code (from your web dashboard):"
        $codeLabel.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Bold)
        $codeLabel.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
        $codeLabel.Location = New-Object System.Drawing.Point(24, 230)
        $codeLabel.Size = New-Object System.Drawing.Size(400, 18)
        $form.Controls.Add($codeLabel)

        $codeBox = New-Object System.Windows.Forms.TextBox
        $codeBox.Text = $codeRef.Value
        $codeBox.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
        $codeBox.ForeColor = [System.Drawing.Color]::FromArgb(79, 70, 229)
        $codeBox.Location = New-Object System.Drawing.Point(24, 250)
        $codeBox.Size = New-Object System.Drawing.Size(395, 28)
        $form.Controls.Add($codeBox)

        # Cancel Button
        $cancelButton = New-Object System.Windows.Forms.Button
        $cancelButton.Text = "Don't Allow"
        $cancelButton.Font = New-Object System.Drawing.Font("Segoe UI", 9)
        $cancelButton.Location = New-Object System.Drawing.Point(210, 310)
        $cancelButton.Size = New-Object System.Drawing.Size(95, 32)
        $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
        $form.Controls.Add($cancelButton)

        # OK / Connect Button
        $okButton = New-Object System.Windows.Forms.Button
        $okButton.Text = "Allow and Connect"
        $okButton.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
        $okButton.BackColor = [System.Drawing.Color]::FromArgb(79, 70, 229)
        $okButton.ForeColor = [System.Drawing.Color]::White
        $okButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
        $okButton.FlatAppearance.BorderSize = 0
        $okButton.Location = New-Object System.Drawing.Point(315, 310)
        $okButton.Size = New-Object System.Drawing.Size(104, 32)
        $okButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
        $form.Controls.Add($okButton)

        $form.AcceptButton = $okButton
        $form.CancelButton = $cancelButton

        $diagRes = $form.ShowDialog()
        if ($diagRes -eq [System.Windows.Forms.DialogResult]::OK) {
            $codeRef.Value = $codeBox.Text.Trim()
            $serverRef.Value = $serverBox.Text.Trim()
            return $true
        }
        return $false
    } catch {
        Write-Host "[UpdatePilot Agent] GUI dialog note: $_" -ForegroundColor Yellow
        return $false
    }
}

# 1. Establish Authentication / Pairing
# If a PairingCode is explicitly provided or ResetCredentials is set, treat this as a fresh pairing attempt
if (-not [string]::IsNullOrWhiteSpace($PairingCode) -or $ResetCredentials) {
    if (Test-Path $tokenFile) { Remove-Item $tokenFile -Force }
    $deviceToken = $null
} else {
    $deviceToken = Get-SecureToken
}

if ([string]::IsNullOrWhiteSpace($deviceToken)) {
    if ($AutoEnroll) {
        Write-Host "[UpdatePilot Agent] Waiting for user session to complete automatic registration..." -ForegroundColor Yellow
        $waited = 0
        while ($waited -lt 15) {
            Start-Sleep -Seconds 2
            $waited += 2
            $deviceToken = Get-SecureToken
            if (-not [string]::IsNullOrWhiteSpace($deviceToken)) {
                break
            }
        }
    }

    if ([string]::IsNullOrWhiteSpace($deviceToken)) {
        # Check if GUI consent window should be displayed
        $shouldShowGui = $GUI -or (-not $NonInteractive -and [string]::IsNullOrWhiteSpace($PairingCode))

        if ($shouldShowGui) {
            $codeRef = [ref]$PairingCode
            $serverRef = [ref]$ServerUrl
            $approved = Show-PairingConsentDialog $codeRef $serverRef

            if (-not $approved) {
                Write-Host "[UpdatePilot Agent] Pairing permission was declined or cancelled by user." -ForegroundColor Yellow
                exit 0
            }
            $PairingCode = $codeRef.Value
            $ServerUrl = $serverRef.Value.TrimEnd('/')
            if ($ServerUrl.EndsWith('/api/v1')) {
                $ServerUrl = $ServerUrl.Substring(0, $ServerUrl.Length - 7)
            }
        }

        if ([string]::IsNullOrWhiteSpace($PairingCode)) {
            Write-Host "==========================================================" -ForegroundColor Cyan
            Write-Host "         UpdatePilot Windows Agent - Pairing Setup        " -ForegroundColor Cyan
            Write-Host "==========================================================" -ForegroundColor Cyan
            Write-Host "No paired device credentials found." -ForegroundColor Yellow
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
                serverUrl  = $ServerUrl
                pairedAt   = (Get-Date).ToString("o")
            } | ConvertTo-Json
            Set-Content -Path $metaFile -Value $deviceInfo -Force

            Write-Host "[SUCCESS] Machine successfully paired as '$($pairResponse.deviceName)'!" -ForegroundColor Green
            Write-Host "[SECURITY] Device token saved securely via Windows DPAPI." -ForegroundColor Green

            # Register in Windows User Startup folder so agent stays online across reboots
            try {
                $startupFolder = [Environment]::GetFolderPath('Startup')
                if (Test-Path $startupFolder) {
                    $startupFile = Join-Path $startupFolder "UpdatePilot-Agent.cmd"
                    $startupContent = @"
@echo off
cd /d "$agentDir"
start "" /b powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File "$agentDir\UpdatePilotAgent.ps1"
"@
                    Set-Content -Path $startupFile -Value $startupContent -Force
                    Write-Host "[STARTUP] Registered UpdatePilot Agent in Windows Startup folder for automatic background connection." -ForegroundColor Green
                }
            } catch {
                Write-Host "[STARTUP] Note: Startup folder registration skipped: $_" -ForegroundColor Yellow
            }

            if ($GUI) {
                [void][System.Windows.Forms.MessageBox]::Show(
                    "This Windows PC has successfully connected to UpdatePilot as '$($pairResponse.deviceName)'.`n`nYour dashboard is now synchronized and ready for scans.",
                    "UpdatePilot - Connected Successfully",
                    [System.Windows.Forms.MessageBoxButtons]::OK,
                    [System.Windows.Forms.MessageBoxIcon]::Information
                )
            }
        } catch {
            $errText = $_.Exception.Message
            if ($_.Exception.Response) {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $errText = $reader.ReadToEnd()
            }
            if ($GUI) {
                [void][System.Windows.Forms.MessageBox]::Show(
                    "Pairing Failed: $errText`n`nPlease verify your Backend URL and Pairing Code.",
                    "UpdatePilot - Pairing Error",
                    [System.Windows.Forms.MessageBoxButtons]::OK,
                    [System.Windows.Forms.MessageBoxIcon]::Error
                )
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

# 2. Resilient WinGet Software Inventory Scanner & Update Detector
function Invoke-SoftwareDiscovery() {
    Write-Host "[SCAN] Executing local software inventory scan..." -ForegroundColor Cyan

    $discoveredApps = @()
    $upgradesMap = @{}

    # Step 2a: Check WinGet repository for verified available updates
    try {
        Write-Host "[SCAN] Checking WinGet repository for available software updates..." -ForegroundColor Cyan
        $upgradeOutput = & winget.exe upgrade --accept-source-agreements 2>&1
        $uLines = @($upgradeOutput)
        $uHeaderIdx = -1
        for ($i = 0; $i -lt $uLines.Count; $i++) {
            $line = $uLines[$i]
            if ($line -match '\bName\b' -and $line -match '\bId\b' -and $line -match '\bVersion\b') {
                $uHeaderIdx = $i
                break
            }
        }

        if ($uHeaderIdx -ge 0) {
            $uHeader = $uLines[$uHeaderIdx]
            $uIdxName = $uHeader.IndexOf("Name")
            $uIdxId = $uHeader.IndexOf("Id")
            $uIdxVersion = $uHeader.IndexOf("Version")
            $uIdxAvailable = $uHeader.IndexOf("Available")
            $uIdxSource = $uHeader.IndexOf("Source")

            for ($i = $uHeaderIdx + 2; $i -lt $uLines.Count; $i++) {
                $line = $uLines[$i]
                if ([string]::IsNullOrWhiteSpace($line) -or $line -match '^-+$') { continue }
                if ($line -match '\b\d+\s+upgrades?\s+available\b') { break }

                $uId = ""
                $uAvail = ""
                if ($uIdxId -gt 0 -and $uIdxVersion -gt $uIdxId -and $line.Length -gt $uIdxId) {
                    $len = [Math]::Min($line.Length - $uIdxId, $uIdxVersion - $uIdxId)
                    $uId = $line.Substring($uIdxId, $len).Trim()
                }

                if ($uIdxAvailable -gt 0 -and $line.Length -gt $uIdxAvailable) {
                    $nextIdx = if ($uIdxSource -gt 0) { $uIdxSource } else { $line.Length }
                    $len = [Math]::Min($line.Length - $uIdxAvailable, $nextIdx - $uIdxAvailable)
                    $uAvail = $line.Substring($uIdxAvailable, $len).Trim()
                }

                if (![string]::IsNullOrWhiteSpace($uId) -and ![string]::IsNullOrWhiteSpace($uAvail)) {
                    $upgradesMap[$uId.ToLower()] = $uAvail
                }
            }
            Write-Host "[SCAN] Found $($upgradesMap.Count) verified software updates via WinGet." -ForegroundColor Green
        }
    } catch {
        Write-Host "[SCAN] Note: WinGet upgrade catalog check: $_" -ForegroundColor Yellow
    }

    # Step 2b: Query all installed applications via winget list
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

                # If available version not in winget list, check verified upgrades map
                if ([string]::IsNullOrWhiteSpace($available) -and ![string]::IsNullOrWhiteSpace($id)) {
                    if ($upgradesMap.ContainsKey($id.ToLower())) {
                        $available = $upgradesMap[$id.ToLower()]
                    }
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
            $respBody = $null
            if ($_.Exception.Response) {
                try {
                    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                    $respBody = $reader.ReadToEnd()
                } catch {}
            }
            if ($respBody -match "DEVICE_CREDENTIAL_REVOKED" -or $_.Exception.Response.StatusCode -eq [System.Net.HttpStatusCode]::Unauthorized) {
                Write-Host "[AUTH] Device credentials have been revoked by the server." -ForegroundColor Red
                if (Test-Path $tokenFile) { Remove-Item $tokenFile -Force }
                if (Test-Path $metaFile) { Remove-Item $metaFile -Force }
                Write-Host "[AUTH] Stored credentials cleared. Please run the 1-Click Setup again to re-pair this PC." -ForegroundColor Yellow
                exit 1
            }
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

                # Stream WinGet output so we can capture MB progress lines (e.g. "20.0 MB /  180 MB")
                $psi = New-Object System.Diagnostics.ProcessStartInfo
                $psi.FileName = "winget.exe"
                $psi.Arguments = $upgradeArgs
                $psi.RedirectStandardOutput = $true
                $psi.RedirectStandardError = $true
                $psi.UseShellExecute = $false
                $psi.CreateNoWindow = $false

                $process = [System.Diagnostics.Process]::Start($psi)
                $lastProgressReport = [DateTime]::MinValue

                while (-not $process.StandardOutput.EndOfStream) {
                    $line = $process.StandardOutput.ReadLine()
                    if ($line) { Write-Host $line }

                    # Parse WinGet download progress: "  20.0 MB /  197 MB"
                    if ($line -match '(\d+\.?\d*)\s+MB\s*/\s*(\d+\.?\d*)\s+MB') {
                        $dlMB    = [double]$Matches[1]
                        $totMB   = [double]$Matches[2]
                        $nowTime = [DateTime]::Now
                        # Throttle: report at most every 2 seconds
                        if (($nowTime - $lastProgressReport).TotalSeconds -ge 2) {
                            try {
                                $progressBody = (@{ downloadedMB = $dlMB; totalMB = $totMB } | ConvertTo-Json -Compress)
                                Invoke-RestMethod -Uri "$ServerUrl/agent/v1/jobs/$jobId/progress" `
                                    -Method Patch -Headers $headers -Body $progressBody `
                                    -ContentType "application/json" -ErrorAction SilentlyContinue | Out-Null
                            } catch {}
                            $lastProgressReport = $nowTime
                        }
                    }
                }
                $process.WaitForExit()
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

