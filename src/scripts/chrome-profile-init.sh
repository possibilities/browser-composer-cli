#!/bin/bash
set -e

echo "[browser-composer] Chrome profile initialization starting..."

# Initialize Chrome profile if directory is empty
if [ -d "/home/kernel/user-data" ]; then
  if [ -z "$(ls -A /home/kernel/user-data 2>/dev/null)" ]; then
    echo "[browser-composer] Empty user-data directory detected: initializing Chrome profile..."
    if [ -d "/user-data" ]; then
      echo "[browser-composer] Copying from /user-data template..."
      cp -r /user-data/* /home/kernel/user-data/ 2>/dev/null || true
    else
      echo "[browser-composer] No template found, Chrome will create a fresh profile"
    fi
  else
    echo "[browser-composer] Existing Chrome profile detected"
  fi
  
  echo "[browser-composer] Setting proper ownership..."
  chown -R kernel:kernel /home/kernel/user-data 2>/dev/null || true
fi

# Clean up Chrome lock files
if [ -d "/home/kernel/user-data" ]; then
  echo "[browser-composer] Cleaning up Chrome lock files..."
  find /home/kernel/user-data -name "SingletonLock" -delete 2>/dev/null || true
  find /home/kernel/user-data -name "SingletonSocket" -delete 2>/dev/null || true
  find /home/kernel/user-data -name "SingletonCookie" -delete 2>/dev/null || true
  find /home/kernel/user-data -name ".org.chromium.Chromium.*" -delete 2>/dev/null || true
  rm -f /home/kernel/user-data/Default/LOCK 2>/dev/null || true
  rm -f "/home/kernel/user-data/Last Version" 2>/dev/null || true
  
  echo "[browser-composer] Lock file cleanup complete"
fi

echo "[browser-composer] Chrome profile initialization complete"

# Execute the original wrapper.sh
exec /wrapper.sh "$@"