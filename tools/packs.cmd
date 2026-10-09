@echo off
rem Runs tools\packs.ps1 without needing PowerShell scripts to be enabled. Usage: tools\packs build^|extract [pack ...]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0packs.ps1" %*
