@echo off
rem Run one Thesis NH command from the repository root (used by scheduled tasks).
cd /d "%~dp0.."
"D:\node24\node-v24.14.0-win-x64\node.exe" --env-file=.env %*
