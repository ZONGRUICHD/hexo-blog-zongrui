---
title: 在 Arch Linux 上安装 Fusion 360
date: 2026-06-14 22:30:00
tags:
  - Fusion 360
  - Arch Linux
  - Wine
categories:
  - Linux
  - 教程
---

本文记录在 Arch Linux 上安装并运行 Fusion 360 的过程。

> Fusion 360 没有官方 Linux 版。本文使用社区项目和定制 Wine 运行，并非原生移植版。

<!-- more -->

## 环境

- Arch Linux
- GNOME Wayland
- NVIDIA RTX 4060
- 2560×1440 高分屏

## 安装

使用社区项目 [Autodesk-Fusion-360-on-Linux](https://github.com/cryinkfly/Autodesk-Fusion-360-on-Linux)：

```bash
git clone https://github.com/cryinkfly/Autodesk-Fusion-360-on-Linux.git
cd Autodesk-Fusion-360-on-Linux
chmod +x files/setup/autodesk_fusion_installer_x86-64.sh
./files/setup/autodesk_fusion_installer_x86-64.sh --install-fix --default
```

Arch Linux 需要的基础依赖如下，安装脚本通常也会自动检查：

```bash
sudo pacman -S --needed \
  gawk cabextract coreutils curl lsb-release mesa-demos mesa-utils \
  p7zip polkit samba wget libspnav xdg-utils bc xorg-xrandr \
  mokutil desktop-file-utils qt5-tools
```

`--install-fix` 会编译并使用项目适配过的 Wine，`--default` 表示采用默认安装目录。安装过程中还会准备 DXVK/Vulkan、.NET Framework 4.8、VC++ Runtime 2022 和 WebView2，随后下载 Autodesk 官方安装程序。

主要文件安装在：

```text
~/.autodesk_fusion/                  Fusion 数据和 Wine Prefix
~/.autodesk_fusion/bin/              启动脚本
~/.autodesk_fusion/wineprefixes/     Windows 兼容环境
~/fusion-wine-build/                 定制 Wine
```

整个目录大约占用 15 GB，建议提前预留至少 20 GB 空间。

## 配置代理

我的网络环境需要使用本机代理，地址为：

```text
127.0.0.1:10808
```

仅配置 Wine 注册表代理无法让 Fusion Identity SDK 正常联网，最终需要修改以下文件：

```text
~/.autodesk_fusion/wineprefixes/default/drive_c/users/$USER/AppData/Local/Autodesk/Neutron Platform/Options/NMachineSpecificOptions.xml
~/.autodesk_fusion/wineprefixes/default/drive_c/users/$USER/AppData/Roaming/Autodesk/Neutron Platform/Options/NMachineSpecificOptions.xml
```

在 `NetworkOptionGroup` 中设置：

```xml
<WindowsProxyOptionId Value="Override"/>
<ProxyHostOptionId Value="127.0.0.1"/>
<ProxyPortOptionId Value="10808"/>
<SSLVerifyPeerOptionId Value="TrustAllServers"/>
```

第二个文件可能是 UTF-16 编码，编辑时不要直接破坏原有编码。无需代理的网络环境可以跳过这一步。

## 修复启动崩溃

本次安装后，Fusion 只显示 Service Utility，日志中出现 Qt WebEngine `BREAKPOINT` 崩溃。原因是安装脚本提供的 `Qt6WebEngineCore.dll` 补丁比当前 Fusion 版本旧。

先找到最新的 production 目录：

```bash
PRODUCTION_DIR="$(find "$HOME/.autodesk_fusion/wineprefixes/default/drive_c/Program Files/Autodesk/webdeploy/production" \
  -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' |
  sort -nr | head -1 | cut -d' ' -f2-)"
cd "$PRODUCTION_DIR"
```

如果目录中存在安装脚本留下的备份，先保存补丁，再恢复 Fusion 原版 DLL：

```bash
mv Qt6WebEngineCore.dll Qt6WebEngineCore.dll.community-patch
cp Qt6WebEngineCore.dll.bak Qt6WebEngineCore.dll
```

Fusion 每次更新都会生成新的 production 目录，因此需要操作修改时间最新的目录。

## 高分屏缩放

Fusion 的 Qt WebEngine 会强制使用 `--device-scale-factor=1`，单独设置 GNOME 缩放可能仍然很小。本次在启动脚本中加入：

```bash
export QT_SCALE_FACTOR=2.5
export QT_AUTO_SCREEN_SCALE_FACTOR=0
export QTWEBENGINE_CHROMIUM_FLAGS="--force-device-scale-factor=2.5"
export WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--force-device-scale-factor=2.5"
```

同时将 Wine DPI 设置为 240：

```bash
WINEPREFIX="$HOME/.autodesk_fusion/wineprefixes/default" \
  "$HOME/fusion-wine-build/bin/wine" reg add \
  'HKCU\Control Panel\Desktop' /v LogPixels /t REG_DWORD /d 240 /f
```

具体倍数应按屏幕尺寸调整，常见取值是 1.5、2 或 2.5。

## 启动

为了方便管理，将启动脚本作为 `systemd` 用户服务运行：

```bash
systemd-run --user --unit=autodesk-fusion --collect \
  --working-directory="$HOME/.autodesk_fusion/bin" \
  "$HOME/.autodesk_fusion/bin/autodesk_fusion_launcher.sh"
```

查看状态和结束进程：

```bash
systemctl --user status autodesk-fusion.service
systemctl --user stop autodesk-fusion.service
```

如果服务已经结束，再次运行上面的 `systemd-run` 命令即可启动。桌面菜单中也会生成 Autodesk Fusion 启动项。

最终 Fusion 360 可以正常登录、浏览云端项目并进入建模界面。需要注意，这仍然是 Wine 兼容方案，Fusion 更新后可能需要重新修复 DLL 或缩放配置。

<em>Written By <strong>ZONGRUICHD</strong></em>
