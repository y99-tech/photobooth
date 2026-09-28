# Prints a photo on Windows using the built-in print system (no extra software).
# Rotates the image to match the paper orientation and fits or fills the page.
param(
  [Parameter(Mandatory = $true)][string]$File,
  [string]$Printer = '',
  [int]$Copies = 1,
  [ValidateSet('fit', 'fill')][string]$Scaling = 'fit',
  [double]$Margin = 0
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile($File)
$doc = New-Object System.Drawing.Printing.PrintDocument
if ($Printer) { $doc.PrinterSettings.PrinterName = $Printer }
if (-not $doc.PrinterSettings.IsValid) { throw "Printer '$Printer' not found" }
$doc.PrinterSettings.Copies = [int16]$Copies
$doc.DocumentName = 'Photobooth ' + [System.IO.Path]::GetFileName($File)
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$doc.OriginAtMargins = $false

# Landscape paper for landscape photos, portrait for portrait.
$doc.DefaultPageSettings.Landscape = ($img.Width -gt $img.Height)

$doc.add_PrintPage({
  param($sender, $e)
  $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $b = $e.PageBounds
  $m = $Margin / 25.4 * 100  # mm -> 1/100 inch
  $area = New-Object System.Drawing.RectangleF(($b.X + $m), ($b.Y + $m), ($b.Width - 2 * $m), ($b.Height - 2 * $m))
  $sx = $area.Width / $img.Width
  $sy = $area.Height / $img.Height
  $s = if ($Scaling -eq 'fill') { [Math]::Max($sx, $sy) } else { [Math]::Min($sx, $sy) }
  $w = $img.Width * $s
  $h = $img.Height * $s
  $x = $area.X + ($area.Width - $w) / 2
  $y = $area.Y + ($area.Height - $h) / 2
  $e.Graphics.SetClip($area)
  $e.Graphics.DrawImage($img, [single]$x, [single]$y, [single]$w, [single]$h)
  $e.HasMorePages = $false
})

try { $doc.Print(); Write-Output "sent to $($doc.PrinterSettings.PrinterName)" }
finally { $img.Dispose() }
