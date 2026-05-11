#!/bin/bash
# Kill any existing Electron/Vite processes before starting
pkill -9 -f "electron \." 2>/dev/null
pkill -9 -f "vite" 2>/dev/null
sleep 1
exec npm run dev
