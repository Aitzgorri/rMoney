@echo off
REM Pre-publish audit — Windows CMD wrapper.
REM Requires Git for Windows (git-bash) to be on PATH.

where bash >nul 2>&1
if %errorlevel% neq 0 (
  echo ERROR: bash not found. Install Git for Windows and ensure it is on PATH.
  exit /b 1
)

bash "%~dp0pre-publish-audit.sh"
exit /b %errorlevel%
