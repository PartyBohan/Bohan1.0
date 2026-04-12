#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "  正在启动 My Avatar App..."
echo "  浏览器会自动打开，请稍等..."
echo "  关闭此窗口即可停止服务"
echo ""
python3 server.py
