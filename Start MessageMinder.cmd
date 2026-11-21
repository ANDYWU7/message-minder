@echo off
cd /d "%~dp0"
set "MM_NODE=%LOCALAPPDATA%\Programs\MessageMinderTools\node-v24.22.3-win-x64\node.exe"
if not exist "%MM_NODE%" set "MM_NODE=node"
"%MM_NODE%" scripts\start-local.cjs
if errorlevel 1 (
  pause
  exit /b 1
)
start "" "http://127.0.0.1:8765/connect"
