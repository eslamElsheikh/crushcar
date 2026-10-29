# Build public/favicon.ico (32px + 16px PNG entries) from public/safro_logo.png.
Add-Type -AssemblyName System.Drawing

$root = Split-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) -Parent
$srcPath = Join-Path $root 'public\safro_logo.png'
$dstPath = Join-Path $root 'public\favicon.ico'

$src = [System.Drawing.Image]::FromFile($srcPath)

function New-IcoEntry([System.Drawing.Image]$img, [int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  # Fit the wordmark into the square, preserving aspect ratio.
  $scale = [Math]::Min($size / $img.Width, $size / $img.Height)
  $w = [int]($img.Width * $scale)
  $h = [int]($img.Height * $scale)
  $g.DrawImage($img, [int](($size - $w) / 2), [int](($size - $h) / 2), $w, $h)
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  , $ms.ToArray()
}

$entries = @(
  @{ size = 32; data = New-IcoEntry $src 32 },
  @{ size = 16; data = New-IcoEntry $src 16 }
)
$src.Dispose()

$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([uint16]0)          # reserved
$bw.Write([uint16]1)          # type: icon
$bw.Write([uint16]$entries.Count)
$offset = 6 + 16 * $entries.Count
foreach ($e in $entries) {
  $sz = if ($e.size -ge 256) { 0 } else { [byte]$e.size }
  $bw.Write([byte]$sz)        # width
  $bw.Write([byte]$sz)        # height
  $bw.Write([byte]0)          # color count
  $bw.Write([byte]0)          # reserved
  $bw.Write([uint16]1)        # planes
  $bw.Write([uint16]32)       # bit count
  $bw.Write([uint32]$e.data.Length)
  $bw.Write([uint32]$offset)
  $offset += $e.data.Length
}
foreach ($e in $entries) { $bw.Write($e.data) }
$bw.Flush()
[System.IO.File]::WriteAllBytes($dstPath, $ms.ToArray())
$bw.Dispose()
$ms.Dispose()

$f = Get-Item $dstPath
"{0}  {1} bytes" -f $f.FullName, $f.Length
