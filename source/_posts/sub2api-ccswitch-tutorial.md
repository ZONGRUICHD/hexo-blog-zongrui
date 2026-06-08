---
title: OpenCode / Claude Code / Codex 配合 CC Switch 接入 SUB2API 中转站教程
date: 2026-06-08 15:55:00
tags:
  - OpenCode
  - Claude Code
  - Codex
  - CC Switch
  - SUB2API
  - API
categories:
  - AI
  - 教程
---

本文是一篇给新手看的配置教程，主要讲如何在 **OpenCode**、**Claude Code**、**Codex** 这三类 AI 编程工具中，配合 **CC Switch** 管理配置，并统一接入我的 **SUB2API 中转站 URL 和密钥**。

先把关系说清楚：

> **SUB2API 才是中转站。**
>
> **CC Switch 不是中转站，它只是用来切换 Provider、模型和配置的工具。**

也就是说，真正接收请求的是 SUB2API；CC Switch 只是帮助你更方便地在不同工具、不同模型、不同 Provider 之间切换。

<!-- more -->

## 一、我的 SUB2API 信息

SUB2API 官网地址：

```text
https://20260513.xyz
```

OpenAI-compatible API 地址：

```text
https://20260513.xyz/v1
```

Claude / Anthropic Messages endpoint：

```text
https://20260513.xyz/v1/messages
```

密钥填写位置示例：

```text
<YOUR_SUB2API_KEY>
```

如果你拿到我提供的赠送密钥，把它完整复制到客户端的密钥输入框即可。

## 二、整体关系

整个调用链可以简单理解成：

```text
OpenCode / Claude Code / Codex
        ↓
通过 CC Switch 选择或切换配置
        ↓
请求你的 SUB2API API 地址
        ↓
SUB2API 转发到上游模型服务
```

所以真正需要填写的是三样东西：

```text
SUB2API API 地址
SUB2API 密钥
SUB2API 后台支持的模型名
```

本文对应配置为：

```text
OpenAI Base URL:         https://20260513.xyz/v1
Claude Messages endpoint: https://20260513.xyz/v1/messages
Key:                     <YOUR_SUB2API_KEY>
Model:                   SUB2API 后台支持的模型名
```

## 三、配置 CC Switch

CC Switch 的作用不是转发请求，而是帮你管理和切换不同配置。

你可以在 CC Switch 中新建一个 Provider，例如叫：

```text
SUB2API
```

如果配置 OpenAI-compatible Provider，逻辑如下：

```json
{
  "name": "SUB2API-OpenAI-Compatible",
  "base_url": "https://20260513.xyz/v1",
  "api_key": "<YOUR_SUB2API_KEY>",
  "models": [
    "gpt-5.1-codex",
    "deepseek-chat"
  ]
}
```

如果配置 Claude / Anthropic Messages Provider，逻辑如下：

```json
{
  "name": "SUB2API-Claude-Messages",
  "base_url": "https://20260513.xyz/v1/messages",
  "api_key": "<YOUR_SUB2API_KEY>",
  "models": [
    "claude-sonnet-4-5"
  ]
}
```

这里需要注意：

- OpenAI-compatible 工具一般填 `https://20260513.xyz/v1`；
- Claude / Anthropic Messages 兼容接口一般走 `https://20260513.xyz/v1/messages`；
- `api_key` 填 SUB2API 的密钥；
- `models` 填 SUB2API 后台实际支持的模型名；
- CC Switch 只是切换配置，不是中转站。

错误理解：

```text
OpenCode → CC Switch → SUB2API
```

正确理解：

```text
OpenCode → 使用 CC Switch 选中的配置 → SUB2API
```

## 四、OpenCode 接入 SUB2API

OpenCode 如果支持 OpenAI-compatible Provider，就可以直接接入 SUB2API。

配置项一般类似：

```text
Provider: OpenAI Compatible
Base URL: https://20260513.xyz/v1
Key:      <YOUR_SUB2API_KEY>
Model:    SUB2API 后台支持的模型名
```

如果 OpenCode 支持环境变量，也可以这样配置：

```bash
export OPENAI_BASE_URL="https://20260513.xyz/v1"
export OPENAI_API_KEY="<YOUR_SUB2API_KEY>"
```

然后启动 OpenCode：

```bash
opencode
```

如果能正常返回模型回答，说明 OpenCode 已经通过 SUB2API 连通。

## 五、Claude Code 接入 SUB2API

Claude Code 本身偏向 Anthropic 体系，所以这里要看 SUB2API 是否提供 Claude Messages 兼容接口，或者是否把 Claude 模型转换成 OpenAI-compatible 格式。

如果使用 Claude / Anthropic Messages 兼容接口，完整 endpoint 是：

```text
https://20260513.xyz/v1/messages
```

如果工具要求你填写的是 **完整 Claude Messages endpoint**，就填：

```text
https://20260513.xyz/v1/messages
```

如果工具要求你填写的是 **Anthropic Base URL**，通常填根地址或上级地址，例如：

```text
https://20260513.xyz
```

再由工具自动拼接 `/v1/messages`。

如果使用环境变量，常见写法可能类似：

```bash
export ANTHROPIC_BASE_URL="https://20260513.xyz"
export ANTHROPIC_AUTH_TOKEN="<YOUR_SUB2API_KEY>"
```

如果你的工具不会自动拼接路径，而是要求直接填写 endpoint，则使用：

```text
https://20260513.xyz/v1/messages
```

实际变量名和填写方式以你当前 Claude Code、CC Switch 和 SUB2API 的兼容方式为准。

重点是：

```text
Claude Code 不是连 CC Switch
Claude Code 最终请求的是 SUB2API 的 Claude Messages endpoint
CC Switch 只是负责切换配置
```

## 六、Codex 接入 SUB2API

Codex 通常可以通过配置文件添加自定义 Provider。Codex 走 OpenAI-compatible 接口时，Base URL 使用：

```text
https://20260513.xyz/v1
```

假设 Codex 配置文件支持 `model_providers`，可以写成类似下面这样：

```toml
[model_providers.sub2api]
name = "SUB2API"
base_url = "https://20260513.xyz/v1"
env_key = "SUB2API_API_KEY"

[profiles.sub2api]
model_provider = "sub2api"
model = "gpt-5.1-codex"
```

然后设置环境变量。

Linux / macOS：

```bash
export SUB2API_API_KEY="<YOUR_SUB2API_KEY>"
```

Windows PowerShell：

```powershell
setx SUB2API_API_KEY "<YOUR_SUB2API_KEY>"
```

设置完成后，重新打开终端，再启动 Codex。

如果你想切换模型，只需要修改：

```toml
model = "gpt-5.1-codex"
```

把它改成 SUB2API 后台支持的其他模型即可。

## 七、测试是否接入成功

可以用 curl 简单测试 OpenAI-compatible 模型列表接口：

```bash
curl https://20260513.xyz/v1/models \
  -H "Authorization: Bearer <YOUR_SUB2API_KEY>"
```

如果返回模型列表，说明 OpenAI-compatible Base URL 和密钥基本没问题。

也可以测试 OpenAI-compatible 聊天接口：

```bash
curl https://20260513.xyz/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_SUB2API_KEY>" \
  -d '{
    "model": "gpt-5.1-codex",
    "messages": [
      {
        "role": "user",
        "content": "Hello, SUB2API OpenAI-compatible test."
      }
    ]
  }'
```

如果要测试 Claude / Anthropic Messages endpoint，可以参考下面这种格式：

```bash
curl https://20260513.xyz/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: <YOUR_SUB2API_KEY>" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-5",
    "max_tokens": 512,
    "messages": [
      {
        "role": "user",
        "content": "Hello, SUB2API Claude Messages test."
      }
    ]
  }'
```

如果返回正常 JSON，说明 SUB2API 可以正常转发请求。

## 八、常见错误

### 1. 把 CC Switch 当成中转站

这是最容易弄错的地方。

错误理解：

```text
客户端请求 CC Switch URL
```

正确理解：

```text
客户端请求 SUB2API URL
CC Switch 只负责切换配置
```

### 2. OpenAI URL 和 Claude endpoint 混用

OpenAI-compatible URL 是：

```text
https://20260513.xyz/v1
```

Claude / Anthropic Messages endpoint 是：

```text
https://20260513.xyz/v1/messages
```

不要把 Claude 的完整 endpoint 填到只接受 OpenAI Base URL 的工具里，也不要把 OpenAI Base URL 当成完整 Claude Messages endpoint。

### 3. Claude endpoint 写成单数

错误写法：

```text
https://20260513.xyz/v1/message
```

正确写法：

```text
https://20260513.xyz/v1/messages
```

### 4. 模型名写错

客户端填写的模型名必须在 SUB2API 后台存在。

例如后台支持：

```text
gpt-5.1-codex
claude-sonnet-4-5
deepseek-chat
```

那客户端里就应该填写这些名字，而不是随便写一个不存在的模型名。

### 5. 密钥填错位置

密钥通常不是填在 Base URL 里，而是填在客户端密钥输入框，或者 HTTP Header 里。

OpenAI-compatible 常见格式：

```text
Authorization: Bearer <YOUR_SUB2API_KEY>
```

Claude / Anthropic Messages 常见格式：

```text
x-api-key: <YOUR_SUB2API_KEY>
```

### 6. HTTP / HTTPS 写错

本文使用的是 HTTPS：

```text
https://20260513.xyz
```

不要写成：

```text
http://20260513.xyz
```

## 九、总结

这套配置的核心只有一句话：

> **SUB2API 是中转站，CC Switch 是配置切换工具。**

OpenCode、Claude Code、Codex 都是调用端，它们最终请求的应该是 SUB2API 的接口地址。

记住这几项：

```text
官网地址                   = https://20260513.xyz
OpenAI-compatible Base URL = https://20260513.xyz/v1
Claude Messages endpoint   = https://20260513.xyz/v1/messages
Key                        = <YOUR_SUB2API_KEY>
Model                      = SUB2API 后台支持的模型名
```

配置完成后，就可以通过 CC Switch 在不同工具和模型之间快速切换，同时统一走我的 SUB2API 中转站。
