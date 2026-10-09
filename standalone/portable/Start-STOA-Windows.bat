@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if errorlevel 1 goto try_python
py -3 -c "import sys; raise SystemExit(0 if sys.version_info.major == 3 else 1)" >nul 2>nul
if not errorlevel 1 goto use_py

:try_python
where python >nul 2>nul
if errorlevel 1 goto no_python
python -c "import sys; raise SystemExit(0 if sys.version_info.major == 3 else 1)" >nul 2>nul
if not errorlevel 1 goto use_python

:no_python
echo STOA requires Python 3 to start its local web server.
pause
exit /b 1

:use_py
py -3 serve_stoa.py
exit /b

:use_python
python serve_stoa.py
exit /b
