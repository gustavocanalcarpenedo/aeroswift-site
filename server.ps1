param(
  [int]$Port = 8080
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$script:latest = $null
$script:history = New-Object System.Collections.ArrayList

function Send-Response($stream, $status, $contentType, [byte[]]$body) {
  $reason = if ($status -eq 200) { "OK" } elseif ($status -eq 204) { "No Content" } elseif ($status -eq 400) { "Bad Request" } elseif ($status -eq 404) { "Not Found" } elseif ($status -eq 405) { "Method Not Allowed" } else { "Error" }
  $headers = @(
    "HTTP/1.1 $status $reason",
    "Access-Control-Allow-Origin: *",
    "Access-Control-Allow-Methods: GET, POST, OPTIONS",
    "Access-Control-Allow-Headers: Content-Type",
    "Content-Type: $contentType",
    "Content-Length: $($body.Length)",
    "Connection: close",
    "",
    ""
  ) -join "`r`n"

  $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($headers)
  $stream.Write($headerBytes, 0, $headerBytes.Length)

  if ($body.Length -gt 0) {
    $stream.Write($body, 0, $body.Length)
  }
}

function Send-Text($stream, $status, $contentType, $text) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  Send-Response $stream $status $contentType $bytes
}

function Send-Json($stream, $status, $payload) {
  $json = $payload | ConvertTo-Json -Depth 8 -Compress
  Send-Text $stream $status "application/json" $json
}

function Normalize-Location($data) {
  $lat = $data.lat
  if ($null -eq $lat) { $lat = $data.latitude }

  $lng = $data.lng
  if ($null -eq $lng) { $lng = $data.lon }
  if ($null -eq $lng) { $lng = $data.longitude }

  if ($null -eq $lat -or $null -eq $lng) {
    return $null
  }

  return [pscustomobject]@{
    lat = [double]$lat
    lng = [double]$lng
    speed = if ($null -ne $data.speed) { $data.speed } else { "" }
    satellites = if ($null -ne $data.satellites) { $data.satellites } else { "" }
    altitude = if ($null -ne $data.altitude) { $data.altitude } else { "" }
    battery = if ($null -ne $data.battery) { $data.battery } else { "" }
    source = "gps"
    receivedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  }
}

function Serve-File($stream, $requestPath) {
  if ($requestPath -eq "/") {
    $requestPath = "/dashboard.html"
  }

  $relative = [System.Uri]::UnescapeDataString($requestPath.TrimStart("/"))
  $file = [System.IO.Path]::GetFullPath((Join-Path $root $relative))

  if (-not $file.StartsWith($root) -or -not (Test-Path -LiteralPath $file) -or (Get-Item -LiteralPath $file).PSIsContainer) {
    Send-Text $stream 404 "text/plain" "Arquivo nao encontrado"
    return
  }

  $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
  $types = @{
    ".html" = "text/html"
    ".css" = "text/css"
    ".js" = "application/javascript"
    ".json" = "application/json"
  }

  $contentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
  $bytes = [System.IO.File]::ReadAllBytes($file)
  Send-Response $stream 200 $contentType $bytes
}

function Handle-Client($client) {
  $stream = $client.GetStream()
  $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8, $false, 1024, $true)

  try {
    $requestLine = $reader.ReadLine()
    if ([string]::IsNullOrWhiteSpace($requestLine)) {
      return
    }

    $parts = $requestLine.Split(" ")
    $method = $parts[0]
    $path = $parts[1].Split("?")[0]
    $contentLength = 0

    while ($true) {
      $line = $reader.ReadLine()
      if ($line -eq "") { break }

      if ($line.ToLowerInvariant().StartsWith("content-length:")) {
        $contentLength = [int]$line.Split(":", 2)[1].Trim()
      }
    }

    if ($method -eq "OPTIONS") {
      Send-Text $stream 204 "text/plain" ""
      return
    }

    if ($method -eq "GET" -and $path -eq "/events") {
      Send-Text $stream 404 "text/plain" "SSE indisponivel no servidor PowerShell; o painel usara polling."
      return
    }

    if ($method -eq "GET" -and $path -eq "/api/latest") {
      Send-Json $stream 200 ([pscustomobject]@{ latest = $script:latest; history = $script:history })
      return
    }

    if ($method -eq "POST" -and $path -eq "/api/location") {
      try {
        $buffer = New-Object char[] $contentLength
        [void]$reader.ReadBlock($buffer, 0, $contentLength)
        $body = -join $buffer
        $data = $body | ConvertFrom-Json
        $payload = Normalize-Location $data

        if ($null -eq $payload) {
          Send-Json $stream 400 ([pscustomobject]@{ ok = $false; error = "Envie lat e lng no JSON." })
          return
        }

        $script:latest = $payload
        [void]$script:history.Add($payload)

        while ($script:history.Count -gt 200) {
          $script:history.RemoveAt(0)
        }

        Send-Json $stream 200 ([pscustomobject]@{ ok = $true; location = $payload })
      } catch {
        Send-Json $stream 400 ([pscustomobject]@{ ok = $false; error = $_.Exception.Message })
      }

      return
    }

    if ($method -eq "GET") {
      Serve-File $stream $path
      return
    }

    Send-Text $stream 405 "text/plain" "Metodo nao permitido"
  } finally {
    $reader.Close()
    $stream.Close()
    $client.Close()
  }
}

try {
  $listener.Start()
  Write-Host "AeroSwift GPS server rodando em http://localhost:$Port"
  Write-Host "Na rede local, use o IP deste computador na porta $Port."
  Write-Host "Endpoint: POST http://IP_DO_COMPUTADOR:$Port/api/location"
  Write-Host "Pressione Ctrl+C para parar."

  while ($true) {
    $client = $listener.AcceptTcpClient()
    Handle-Client $client
  }
} finally {
  $listener.Stop()
}
