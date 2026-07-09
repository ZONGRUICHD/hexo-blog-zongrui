---
title: VPN Guide：代理软件、节点导入与自建节点教程
date: 2026-06-05 21:30:00
tags:
  - VPN
  - 代理
  - 节点
  - NekoBox
  - Shadowrocket
  - V2Box
  - v2rayN
  - VLESS
categories:
  - 网络
  - 教程
---

本教程主要是给完全不懂如何配置 VPN、节点以及代理软件的新手看的。

> 本教程仅用于技术交流。请遵守所在地法律法规，严禁用于任何违法用途。
>
> **有问题优先问 AI。**

<!-- more -->

## 第一步：下载代理软件

| 平台 | 推荐软件 | 备注 |
| --- | --- | --- |
| 安卓 | NekoBox | 不会安装 APK 的先去搜索教程 |
| iOS / iPadOS | Shadowrocket、V2Box、Clash Mi | 通常需要外区 Apple ID |
| Windows | v2rayN | 复制节点后可直接导入 |
| Linux | 自行选择客户端 | 都用 Linux 了就别问我了 |

~~台球桌：火星代理（bushi~~

## 第二步：导入节点

一般我会给你一个节点链接，例如：

```text
vless://...
ss://...
```

复制好这一串链接后，按对应平台导入。

### 安卓：NekoBox

右上角点击菜单，然后选择「从剪贴板导入链接」。导入完成后选中节点，点击小飞机按钮即可。

### iOS / iPadOS：V2Box

复制节点链接，进入「配置」界面，点击加号，然后选择「从剪贴板导入链接」。

### Windows：v2rayN

复制节点链接，打开 v2rayN，直接粘贴即可。

### Linux

~~你都用 Linux 了就别问我了。~~

导入后可以先用 `TCPing` 测一下节点通不通。

## 第三步：配置分流

安卓、iOS、Windows、Linux 都建议配置分流规则。

重点是：

- 国内网站 / App 尽量直连；
- 国外网站 / App 按需代理；
- 配置好「绕过大陆域名 / 绕过中国大陆地址」之类的规则。

## 第四步：自建节点

> 这一步不会的非必要不要问我，懒得回答。

1. 先去 [akile.ai](https://akile.ai) 买一台 VPS（服务器），按需选择，网页内有选购指导。
2. 开机。
3. 获取公网 IP 地址和 VPS 密码。
4. 手机上通过 **Termius** 软件远程连接到 VPS。
5. 在 VPS 里输入以下命令：

```bash
bash <(curl -L https://raw.githubusercontent.com/Gavin-LHX/fast-vless/main/xrayvless.sh)
```

按照提示往下走，最后会获得一个类似下面这种开头的链接：

```text
vless://...
```

6. 通过上面的教程导入代理软件。

**有不懂的优先问 AI 或 YouTube。**

---

<em>海内存知己，天涯若比邻。</em>

<em>Written By <strong>ZONGRUICHD</strong></em>

<https://github.com/ZONGRUICHD/VPN-Guide/blob/main/README.md>
