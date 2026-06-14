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
./files/setup/autodesk_fusion_installer_x86-64.sh --install-fix --default
```

脚本会准备定制 Wine 环境，并安装 DXVK/Vulkan、.NET Framework、VC++ Runtime、WebView2 等组件，随后下载 Autodesk 官方 Fusion 360 安装程序。

主要文件安装在：

```text
~/.autodesk_fusion
~/fusion-wine-build
```

## 问题处理

安装完成后还处理了三个问题：

1. **无法登录**：在 Fusion 的 `NMachineSpecificOptions.xml` 中配置本机 HTTP 代理。
2. **启动崩溃**：安装脚本替换的 `Qt6WebEngineCore.dll` 与当前版本不兼容，恢复 Fusion 自带 DLL 后正常启动。
3. **界面过小**：配置 Wine DPI、Qt 缩放和 DPI 兼容层，适配高分屏。

## 启动

为了方便管理，将启动脚本作为 `systemd` 用户服务运行：

```bash
systemd-run --user --unit=autodesk-fusion --collect \
  --working-directory="$HOME/.autodesk_fusion/bin" \
  "$HOME/.autodesk_fusion/bin/autodesk_fusion_launcher.sh"
```

之后可以使用下面的命令管理进程：

```bash
systemctl --user start autodesk-fusion.service
systemctl --user stop autodesk-fusion.service
```

最终 Fusion 360 可以正常登录、浏览云端项目并进入建模界面。需要注意，这仍然是 Wine 兼容方案，Fusion 更新后可能需要重新修复 DLL 或缩放配置。

<em>Written By <strong>ZONGRUICHD</strong></em>
