@echo off
cd /d "%~dp0..\.."
echo Starting C++ Bridge...
cpp\build\bridge_client.exe
echo Bridge exited with code %ERRORLEVEL%
pause