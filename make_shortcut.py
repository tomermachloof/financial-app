import subprocess, os, tempfile

script = (
    "$ws = New-Object -ComObject WScript.Shell\n"
    "$s = $ws.CreateShortcut('C:\\Users\\yaele\\Desktop\\Financial-App.lnk')\n"
    "$s.TargetPath = 'C:\\Users\\yaele\\Desktop\\AI LEARNING 1\\financial-app\\start.bat'\n"
    "$s.WorkingDirectory = 'C:\\Users\\yaele\\Desktop\\AI LEARNING 1\\financial-app'\n"
    "$s.WindowStyle = 7\n"
    "$ep = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'\n"
    "if (Test-Path $ep) { $s.IconLocation = $ep + ',0' }\n"
    "$s.Save()\n"
    "Write-Host 'Shortcut created'\n"
)

tmp = os.path.join(tempfile.gettempdir(), 'make_sc.ps1')
with open(tmp, 'w', encoding='utf-8') as f:
    f.write(script)

r = subprocess.run(['powershell', '-ExecutionPolicy', 'Bypass', '-File', tmp],
                   capture_output=True, text=True)
print("OUT:", r.stdout)
print("ERR:", r.stderr)
os.remove(tmp)

# Now rename to Hebrew
src = r'C:\Users\yaele\Desktop\Financial-App.lnk'
dst = r'C:\Users\yaele\Desktop\ניהול פיננסי תומר ויעל.lnk'
if os.path.exists(src):
    if os.path.exists(dst):
        os.remove(dst)
    os.rename(src, dst)
    print("Renamed to Hebrew successfully")
