Add-Type -AssemblyName System.Drawing
function New-TriageIcon {
  param([int]$Size, [string]$Path)
  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(255, 84, 198, 84))
  $w = [Math]::Max(8, [int]($Size / 32))
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White, $w)
  $cx = $Size / 2.0
  $half = $Size * 0.22
  $g.DrawLine($pen, [float]($cx - $half), [float]$cx, [float]($cx + $half), [float]$cx)
  $g.DrawLine($pen, [float]$cx, [float]($cx - $half), [float]$cx, [float]($cx + $half))
  $pen.Dispose()
  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$icons = Join-Path $root "public\icons"
New-TriageIcon -Size 192 -Path (Join-Path $icons "icon-192.png")
New-TriageIcon -Size 512 -Path (Join-Path $icons "icon-512.png")
New-TriageIcon -Size 180 -Path (Join-Path $icons "icon-180.png")
Write-Host "Icons written to $icons"
