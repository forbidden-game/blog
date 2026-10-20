# eipi10

一个以黑底白字、像素界面、可读正文和照片为核心的静态博客。托管在 GitHub Pages。

## 为什么不是 Node

这个站是纯静态 HTML/CSS/JS：浏览器不需要 Node，GitHub Pages 也不需要 Node。

构建层用 **Hugo extended 单二进制**，因为它在没有 npm 依赖树的情况下提供了 Markdown、标签页、RSS、sitemap 和构建期图片处理（WebP、响应式尺寸、裁剪）。本地只需要一个 Hugo 可执行文件；CI 由 GitHub Actions 下载固定版本。

## 本地预览

需要 Hugo extended **0.168.0** 或兼容版本。

```bash
hugo server
```

打开 `http://localhost:1313/`。

生产构建：

```bash
hugo --minify --baseURL "https://<user>.github.io/<repo>/"
```

GitHub Pages 的项目站点需要末尾的路径；用户站点（仓库名为 `<user>.github.io`）则用 `https://<user>.github.io/`。

## 写一篇文章

每篇文章是一个单独的 Markdown 文件；图片统一放在 `assets/uploads/`：

```text
content/posts/my-slug.md
assets/uploads/my-cover.jpg
assets/uploads/my-photo-01.jpg
```

新建：

```bash
hugo new content posts/my-slug.md --kind posts
```

Frontmatter 示例：

```yaml
---
title: "标题"
slug: "my-slug"
date: 2026-10-18T08:30:00+08:00
lastmod: 2026-10-18T08:30:00+08:00
description: "一句话摘要"
tags: ["photo", "life"]
kind: "photo"          # note | essay | photo
cover: "uploads/my-cover.jpg"
coverAlt: "封面的替代文本，必填"
photos:
  - src: "uploads/my-photo-01.jpg"
    alt: "照片的替代文本，必填"
    caption: "图注"
---
```

- `kind: note` / `essay`：常规文章。正文里用 figure shortcode 插入图片。
- `kind: photo`：正文是引言，`photos` 数组会在正文后渲染为照片瀑布流。
- `cover` 用于列表、OG 和文章头图（`photo` 类型不重复渲染头图）。
- `photos` 也会出现在 `/photos/` 接触印样页。
- 图片路径统一以 `uploads/` 开头；Hugo 从 `assets/uploads/` 读取并生成 WebP/srcset。

正文插图：

```text
{{< figure src="uploads/my-photo-01.jpg" alt="必填" caption="图注" >}}
{{< figure src="uploads/my-cover.jpg" alt="必填" class="wide" >}}
{{< figure src="uploads/my-portrait.jpg" alt="必填" class="portrait" sizes="(max-width: 768px) 100vw, 480px" >}}
```

- `class="wide"`：960px 出血。
- `class="bleed"`：1200px 全出血。
- `class="portrait"`：限制为 480px。
- 不加 class：跟随正文栏（默认 648px；像素模式 768px）。

## 可视化编辑

打开：

```text
https://forbidden-game.github.io/blog/edit/
```

页脚也有 **Edit** 链接。编辑器用 iframe 加载真实页面，页面骨架不变，只把内容区域变成可编辑：

1. 第一次打开时输入 GitHub **fine-grained PAT**。
2. Token 只需要 `forbidden-game/blog` 一个仓库：
   - **Contents: Read and write**
   - **Metadata: Read**
3. 选择页面，直接改标题、描述、正文和图注。
4. 图片上的“更换图片”可以替换封面、正文图和照片组图片。
5. 点 **Save**，编辑器会 commit 到 `main`，GitHub Actions 自动构建部署。

Token 只存在当前标签页的 `sessionStorage`，关闭标签页即清除；不要把它提交到仓库。保存失败时：

- `401/403`：Token 失效或权限不足，重新输入。
- `409`：远端文件已变化，点 **Reload** 后重试。

编辑器只处理内容，不改布局、CSS、导航和站点配置。正文编辑器覆盖段落、标题、引用、列表、代码块和 figure；其它自定义 shortcode 仍然直接改 Markdown。标签、日期、`kind` 等 frontmatter 字段也在 Markdown 里改。

新文章仍然是一个单独的 `.md` 文件；保存后 `/edit/` 的页面列表会在部署完成后出现。

## 图片约定

- 导出 sRGB JPEG，长边约 2000–2400px，质量 85 左右。
- 原始大图/RAW 不要进 Git；仓库只保留网页用图。
- 图片统一放在 `assets/uploads/`，文件名必须唯一。
- 手动添加图片时，可以走 GitHub 的 **Add file → Upload files**，然后在 frontmatter 或 shortcode 里写 `uploads/文件名`。
- 可视化编辑器的“更换图片”会自动上传到 `assets/uploads/` 并更新对应字段。
- Hugo 构建时生成 WebP 与多尺寸 `srcset`；封面额外生成 1200×630 的 OG 图。
- 所有 `coverAlt`、`photos[].alt`、figure 的 `alt` 都是必填。缺图或缺少 alt 时 Hugo 会报错/警告。

## 部署到 GitHub Pages

1. 推到 GitHub 的 `main` 分支。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 推送后 `.github/workflows/deploy.yml` 会构建并发布。

Workflow 用 `actions/configure-pages` 获取真实 Pages URL，再传给 Hugo 的 `--baseURL`。因此项目站点（`/<repo>/`）和用户站点（`/`）都不需要手改配置。

可视化编辑器的 Save 和本地 `git push` 是同一条部署链路。两种方式不要同时改同一篇：如果你在编辑器里保存过，先在本地 `git pull`；如果本地有未提交修改，先提交/推送，再打开编辑器。

## 站点配置

- `hugo.toml`：站点名、描述、作者、导航文案、RSS 限制、图片质量。
- `content/_index.md`：首页标题与描述。
- `content/about.md`：关于页与 colophon。
- `static/og-default.png`：没有封面时的默认 OG 图。
- `static/favicon.svg` / `static/apple-touch-icon.png`：图标。

站点名是 **eipi10**。改名时，至少同步 `hugo.toml` 的 `title`、`params.author` 和 `content/_index.md` 的 `title`，以及 `static/favicon.svg`、`static/apple-touch-icon.png` 和 `static/og-default.png`。

## 字号规则

正文默认是系统无衬线字体：**18px / 1.9，栏宽 36em**。这是为长文阅读准备的主正文。

页头的 `Aa` 会把正文切到像素模式：**24px / 40px，栏宽 32em**。像素字体是 12px 网格设计的，像素模式下的字号必须使用 12 的整数倍：

- 元信息 12px / 20px。
- 像素模式内 H3 24px，H2 36px。
- 文章标题 H1 48px（移动端 36px）。
- 首页大标题 72px（移动端 48px）。

不要使用 `clamp()`、`vw` 字号、`transform: scale()` 或非 12 倍数的像素字号；像素元素不要合成粗体/斜体。强调用颜色、下划线或反白。标题、导航、日期和图注始终保留像素字体。

## 字体

[Fusion Pixel 12px Prop / Mono zh-Hans](https://github.com/TakWolf/fusion-pixel-font)，SIL OFL 1.1。许可证在 `assets/fonts/OFL.txt`。

## 目录

```text
assets/css/          站点样式与编辑器样式
assets/js/           灯箱、阅读模式、编辑器
assets/js/vendor/    js-yaml、Turndown（仅编辑器加载）
assets/fonts/        Fusion Pixel 字体
assets/uploads/      文章图片（封面、正文图、照片组）
content/_index.md    首页内容
content/about.md     About
content/posts/*.md   单文件文章
content/photos/      /photos 页面
content/edit/        /edit 编辑器页面
layouts/              Hugo 模板、partials、shortcodes
static/               favicon、默认 OG、.nojekyll
public/               构建产物（已忽略）
resources/            Hugo 图片缓存（已忽略）
```
