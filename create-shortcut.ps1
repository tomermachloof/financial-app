$ws = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$shortcut = $ws.CreateShortcut("$desktop\ניהול פיננסי תומר ויעל.lnk")
$shortcut.TargetPath = 'C:\Users\yaele\Desktop\AI LEARNING 1\financial-app\start.bat'
$shortcut.WorkingDirectory = 'C:\Users\yaele\Desktop\AI LEARNING 1\financial-app'
$shortcut.WindowStyle = 7
$shortcut.Description = 'ניהול פיננסי תומר ויעל'

$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (Test-Path $edgePath) {
    $shortcut.IconLocation = $edgePath + ',0'
} else {
    $shortcut.IconLocation = $env:SystemRoot + '\System32\SHELL32.dll,220'
}

$shortcut.Save()
Write-Host "Shortcut created at: $desktop\ניהול פיננסי תומר ויעל.lnk"
