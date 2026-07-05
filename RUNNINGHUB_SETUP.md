# RunningHub 工作流上线说明

本项目已接入 RunningHub 工作流在线调用页：

```txt
/runninghub
```

## 0. 已确认的真实 RunningHub 信息

从 AI CanvasPro 抓到的实际模型：

```txt
model: runninghub/2050306122774532097
provider: runninghubwf
```

对应本地源码位置：

```txt
D:\huabu\AI CanvasPro\resources\app\src\manifests\image\runninghub\qwenImageEditManifest.js:1
```

当前工作流信息：

```txt
workflowId: 2050306122774532097
提交模式：openapi-v2-ai-app
查询模式：openapi-v2-query
```

真实 RunningHub 调用地址：

```txt
提交：https://www.runninghub.cn/openapi/v2/run/ai-app/2050306122774532097
查询：https://www.runninghub.cn/openapi/v2/query
```

注意：这个工作流不是 `/run/workflow/{workflowId}` 模式，而是 `/run/ai-app/{workflowId}` 模式。

## 1. 必填环境变量

在服务器环境变量中配置：

```bash
RUNNINGHUB_API_KEY=你的 RunningHub API Key
```

可选：

```bash
RUNNINGHUB_WORKFLOW_ID=2050306122774532097
RUNNINGHUB_API_BASE=https://www.runninghub.cn/openapi/v2
RUNNINGHUB_SUBMIT_MODE=ai-app
RUNNINGHUB_UPLOAD_LIMIT=300mb
```

兼容旧变量名：

```bash
RH_API_KEY=你的 RunningHub API Key
```

如果以后遇到传统 workflow 提交模式，可以改成：

```bash
RUNNINGHUB_SUBMIT_MODE=workflow
```

## 2. 已新增后端接口

### 获取配置

```http
GET /api/runninghub/workflow/config
```

返回内容会包含：

```json
{
  "workflowId": "2050306122774532097",
  "submitMode": "ai-app",
  "queryMode": "openapi-v2-query",
  "runUrl": "https://www.runninghub.cn/openapi/v2/run/ai-app/2050306122774532097",
  "queryUrl": "https://www.runninghub.cn/openapi/v2/query",
  "apiKeyConfigured": true
}
```

### 上传素材到 RunningHub

前端直接把 File 作为请求 body 上传：

```http
POST /api/runninghub/media/upload
Content-Type: video/mp4 或 image/png
x-file-name: demo.mp4
```

成功后返回 RunningHub 的 `download_url`，再把这个 URL 填入对应节点。

### 提交 AI App 工作流

前端仍然调用项目自己的后端代理：

```http
POST /api/runninghub/workflow/run
Content-Type: application/json
```

后端会转发到：

```txt
https://www.runninghub.cn/openapi/v2/run/ai-app/2050306122774532097
```

请求体：

```json
{
  "workflowId": "2050306122774532097",
  "submitMode": "ai-app",
  "instanceType": "default",
  "usePersonalQueue": false,
  "nodeInfoList": [
    {
      "nodeId": "你的节点ID",
      "fieldName": "text",
      "fieldValue": "你的参数"
    }
  ]
}
```

### 查询任务

```http
POST /api/runninghub/workflow/query
Content-Type: application/json
```

后端会转发到：

```txt
https://www.runninghub.cn/openapi/v2/query
```

请求体：

```json
{
  "taskId": "RunningHub 返回的 taskId"
}
```

### 提交并等待

```http
POST /api/runninghub/workflow/run-and-wait
```

这个接口会提交任务并在服务端轮询，适合调试；生产上建议使用 `/run` + `/query` 或 webhook。

### Webhook 接收

```http
POST /api/runninghub/workflow/webhook
```

如果你的部署域名是：

```txt
https://your-domain.com
```

则 RunningHub webhookUrl 可以填：

```txt
https://your-domain.com/api/runninghub/workflow/webhook
```

## 3. 前端使用方式

访问：

```txt
/runninghub
```

页面流程：

1. 确认 API Key 已配置。
2. 上传视频文件，得到视频 URL。
3. 上传人物参考图，得到图片 URL。
4. 填入工作流中对应的视频节点 ID、参考图节点 ID、提示词节点 ID。
5. 点击“生成 nodeInfoList”。
6. 点击“提交运行”。
7. 等待状态变成 `SUCCESS`，页面会显示结果视频或图片。

## 4. 最重要的待填项

目前已确认提交模式是 `openapi-v2-ai-app`，但具体输入节点仍然要以 `qwenImageEditManifest.js` 或 RunningHub API 页面复制出的 `nodeInfoList` 为准。

需要确认：

```txt
视频输入节点 nodeId + fieldName
人物参考图节点 nodeId + fieldName
提示词节点 nodeId + fieldName
输出节点 nodeId 不需要填，RunningHub 会在 results 中返回
```

常见 fieldName：

```txt
text
image
video
image_url
video_url
```

最终以 RunningHub 页面复制出来的 cURL / nodeInfoList / AI CanvasPro manifest 为准。

## 5. 结果链接转存提醒

RunningHub 结果 URL 通常有时效。生产环境应在 `SUCCESS` 后立即把 `results[].url` 下载并转存到自己的对象存储。
