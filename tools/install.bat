@echo off
chcp 65001 >nul
setlocal
rem Copies the mod into every Isaac install found in the Steam libraries.

set "SRC=%~dp0binding of the butt"
if not exist "%SRC%\main.lua" (
  echo Mod folder not found next to this script: "%SRC%"
  pause & exit /b 1
)

for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command ^
  "$steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath;" ^
  "if (-not $steam) { exit };" ^
  "$libs = @($steam) + (Select-String -Path (Join-Path $steam 'steamapps\libraryfolders.vdf') -Pattern '\"path\"\s+\"(.+)\"' | ForEach-Object { $_.Matches[0].Groups[1].Value -replace '\\\\','\' });" ^
  "$libs | Select-Object -Unique | ForEach-Object { Join-Path $_ 'steamapps\common\The Binding of Isaac Rebirth\mods' } | Where-Object { Test-Path $_ }"`) do (
  set "FOUND=1"
  echo Installing into "%%D"
  xcopy /E /I /Y /Q "%SRC%" "%%D\binding of the butt\" >nul
)

if not defined FOUND (
  set /p "MODS=Isaac mods folder not found. Paste its full path: "
  if not exist "%MODS%" ( echo Folder does not exist. & pause & exit /b 1 )
  xcopy /E /I /Y /Q "%SRC%" "%MODS%\binding of the butt\" >nul
)

echo.
echo Done. Remember to add --luadebug to Isaac's Steam launch options.
pause
