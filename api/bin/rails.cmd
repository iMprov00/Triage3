@echo off
setlocal
cd /d "%~dp0.."
where bundle >nul 2>&1
if errorlevel 1 (
  echo Не найдена команда bundle. Установите Bundler той же версии, что в Gemfile.lock ^(секция BUNDLED WITH^):
  echo   gem install bundler -v ВЕРСИЯ
  echo   bundle install
  exit /b 1
)
bundle exec ruby "%~dp0rails" %*
endlocal
