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

本文简单记录在 Arch Linux + GNOME Wayland 上安装 Fusion 360 的过程。

> Fusion 360 没有官方 Linux 版。本文使用社区项目和定制 Wine 运行，并非原生移植版。

<!-- more -->

## 安装步骤

1. 使用社区项目 [Autodesk-Fusion-360-on-Linux](https://github.com/cryinkfly/Autodesk-Fusion-360-on-Linux)。
2. 安装 Wine、DXVK/Vulkan、.NET Framework、VC++ Runtime 和 WebView2 等依赖。
3. 运行项目提供的安装脚本，由它下载并安装 Autodesk 官方 Fusion 360。
4. 配置代理，解决登录和在线服务无法连接的问题。
5. 修复 Qt WebEngine DLL 冲突，并配置高分屏缩放。
6. 通过 `systemd --user` 启动 Fusion 360。

启动命令：

```bash
systemctl --user start autodesk-fusion.service
```

最终 Fusion 360 可以正常登录、打开项目并使用云端功能。

<em>Written By <strong>ZONGRUICHD</strong></em>
