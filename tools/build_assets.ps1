# Regenerates static/images and static/fonts from the paper sources.
# Usage (from the repo root):  powershell -ExecutionPolicy Bypass -File tools\build_assets.ps1
param(
    [string]$Paper = (Join-Path $PSScriptRoot '..\..\..\Preprint-Template-meta-style'),
    [string]$Rungs = 'C:\texlive\2026\bin\windows\rungs.exe'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Paper = (Resolve-Path $Paper).Path
$Asset = Join-Path $Paper 'asset'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Img = Join-Path $Root 'static\images'
$Fonts = Join-Path $Root 'static\fonts'
$Tmp = Join-Path $env:TEMP 'sala_web_assets'
New-Item -ItemType Directory -Force $Img, $Fonts, $Tmp | Out-Null

function Render-Pdf([string]$name, [int]$dpi) {
    $out = Join-Path $Tmp "$name.png"
    & $Rungs -q -dSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m "-r$dpi" `
        -dTextAlphaBits=4 -dGraphicsAlphaBits=4 "-sOutputFile=$out" (Join-Path $Asset "$name.pdf")
    if (-not (Test-Path $out)) { throw "Ghostscript failed on $name.pdf" }
    return $out
}

function Save-Image([string]$src, [string]$dstName, [int]$maxWidth, [string]$format, [int]$quality = 88) {
    $image = [System.Drawing.Image]::FromFile($src)
    try {
        $w = [Math]::Min($maxWidth, $image.Width)
        $h = [int][Math]::Round($image.Height * $w / $image.Width)
        $bmp = New-Object System.Drawing.Bitmap $w, $h
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.Clear([System.Drawing.Color]::White)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.DrawImage($image, 0, 0, $w, $h)
        $g.Dispose()
        $dst = Join-Path $Img $dstName
        if ($format -eq 'jpg') {
            $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
            $params = New-Object System.Drawing.Imaging.EncoderParameters 1
            $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$quality)
            $bmp.Save($dst, $codec, $params)
        } else {
            $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
        }
        $bmp.Dispose()
        '{0,-36} {1}x{2}  {3,5} KB' -f $dstName, $w, $h, [int]((Get-Item $dst).Length / 1KB)
    } finally {
        $image.Dispose()
    }
}

# Crops a horizontal band [top, bottom) given as fractions of the image height.
function Save-Band([string]$src, [string]$dstName, [double]$top, [double]$bottom, [int]$quality = 88) {
    $image = [System.Drawing.Image]::FromFile($src)
    try {
        $y0 = [int][Math]::Round($image.Height * $top)
        $h = [int][Math]::Round($image.Height * $bottom) - $y0
        $bmp = New-Object System.Drawing.Bitmap $image.Width, $h
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.DrawImage($image, (New-Object System.Drawing.Rectangle 0, 0, $image.Width, $h),
            (New-Object System.Drawing.Rectangle 0, $y0, $image.Width, $h), [System.Drawing.GraphicsUnit]::Pixel)
        $g.Dispose()
        $tmp = Join-Path $Tmp $dstName.Replace('.jpg', '.png')
        $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
    } finally {
        $image.Dispose()
    }
    Save-Image $tmp $dstName 2200 'jpg' $quality
}

# Diagrams and plots: PNG keeps text crisp.
Save-Image (Join-Path $Asset 'teaser.png')          'teaser.png'          2400 'png'
Save-Image (Join-Path $Asset 'method_overview.png') 'method_overview.png' 2400 'png'
Save-Image (Join-Path $Asset 'scene_pairs.png')     'scene_pairs.png'     2200 'png'
Save-Image (Render-Pdf 'scaling_pre_post' 300)      'scaling_pre_post.png' 2400 'png'
Save-Image (Render-Pdf 'quantizer_losses' 300)      'quantizer_losses.png' 1400 'png'

# Photo-heavy figures: JPEG keeps the page light.
Save-Image (Render-Pdf 'real_data' 300)                       'real_data.jpg'               2400 'jpg'
$realTasks = Render-Pdf 'real_tasks' 220
# Row bands of the four tasks in real_tasks.pdf, below each bold task title.
$bands = @(@(0.021, 0.245), @(0.270, 0.495), @(0.520, 0.746), @(0.781, 1.0))
for ($i = 0; $i -lt 4; $i++) { Save-Band $realTasks "real_task_$i.jpg" $bands[$i][0] $bands[$i][1] }
Save-Image (Render-Pdf 'robotwin_embodiment_comparison' 220)  'robotwin_embodiments.jpg'    2200 'jpg'
Save-Image (Join-Path $Asset 'retrieval_top3_genrobot_v2.png')     'retrieval_human_unseen.jpg' 2070 'jpg'
Save-Image (Join-Path $Asset 'retrieval_top3_human_robot_v2.png')  'retrieval_human_shared.jpg' 2070 'jpg'
Save-Image (Join-Path $Asset 'retrieval_top3_robotwin.png')        'retrieval_robotwin.jpg'     2070 'jpg'
Save-Image (Join-Path $Asset 'sharpa_robot.png')                   'sharpa_robot.jpg'           900  'jpg' 90

Copy-Item (Join-Path $Paper 'store\assets\sharpa-logo.png') (Join-Path $Img 'sharpa-logo.png') -Force
foreach ($f in 'Inter-Regular.ttf', 'Inter-Bold.ttf', 'Inter-Italic.ttf', 'Inter-LICENSE.txt') {
    Copy-Item (Join-Path $Paper "store\$f") (Join-Path $Fonts $f) -Force
}
'done'
