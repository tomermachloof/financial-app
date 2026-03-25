@echo off
cd /d "C:\Users\yaele\Desktop\AI LEARNING 1\financial-app"

:: הפעל שרת אם עדיין לא רץ
netstat -an 2>nul | find ":5173" >nul
if %errorlevel% neq 0 (
    start /min "" cmd /c "cd /d "C:\Users\yaele\Desktop\AI LEARNING 1\financial-app" && npm run dev"
    timeout /t 4 /nobreak >nul
)

:: פתח כאפליקציה עצמאית בלי ממשק דפדפן
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:5173 --window-size=430,932
exit
