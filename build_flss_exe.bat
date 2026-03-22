@echo off
setlocal
pyinstaller --noconfirm --onedir --name flss .\standalone\flss_standalone.py
if errorlevel 1 exit /b %errorlevel%
echo Built standalone runtime at dist\flss\flss.exe
